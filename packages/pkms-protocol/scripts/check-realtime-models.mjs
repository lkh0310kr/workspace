import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const tsSource = ts.createSourceFile('types.ts', read('src/types.ts'), ts.ScriptTarget.Latest, true)
const swift = readFileSync(
  fileURLToPath(new URL('../../apps/pkms-ios/PKMSProtocolModels.swift', root)),
  'utf8'
)
const realtime = JSON.parse(read('realtime.schema.json'))

function tsModel(name) {
  const declaration = tsSource.statements.find(
    (item) => ts.isInterfaceDeclaration(item) && item.name.text === name
  )
  if (!declaration) throw new Error(`TypeScript interface ${name} is missing`)
  const fields = new Set()
  const required = new Set()
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name)) continue
    fields.add(member.name.text)
    if (!member.questionToken) required.add(member.name.text)
  }
  return { fields, required }
}

function swiftModel(name) {
  const start = swift.search(new RegExp(`struct ${name}(?:\\s|:)`))
  if (start < 0) throw new Error(`Swift struct ${name} is missing`)
  const open = swift.indexOf('{', start)
  let depth = 1
  let end = open + 1
  for (; end < swift.length && depth; end++) {
    if (swift[end] === '{') depth++
    else if (swift[end] === '}') depth--
  }
  const body = swift.slice(open + 1, end - 1)
  const fields = new Set()
  const required = new Set()
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s{4}(?:let|var)\s+`?([A-Za-z][A-Za-z0-9_]*)`?\s*:\s*([^{}=]+)$/)
    const inferred = line.match(/^\s{4}let\s+([A-Za-z][A-Za-z0-9]*)\s*=/)
    if (match) {
      fields.add(match[1])
      if (!match[2].trim().endsWith('?')) required.add(match[1])
    } else if (inferred) {
      fields.add(inferred[1])
      required.add(inferred[1])
    }
  }
  return { fields, required }
}

function compare(label, expected, actual) {
  const missing = [...expected].filter((field) => !actual.has(field))
  const extra = [...actual].filter((field) => !expected.has(field))
  if (missing.length || extra.length)
    throw new Error(`${label}: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`)
}

const peer = realtime.$defs?.peer
if (!peer?.properties || !Array.isArray(peer.required))
  throw new Error('Realtime peer schema is missing')
const peerFields = new Set(Object.keys(peer.properties))
const peerRequired = new Set(peer.required)
for (const [label, model] of [
  ['PkmsPeer', tsModel('PkmsPeer')],
  ['PKMSPeer', swiftModel('PKMSPeer')]
]) {
  compare(`Realtime peer fields vs ${label}`, peerFields, model.fields)
  compare(`Realtime peer required fields vs ${label}`, peerRequired, model.required)
}
for (const [schemaName, swiftName] of [
  ['hello', 'PKMSHello'],
  ['documentUpdate', 'PKMSDocumentUpdate'],
  ['operationResult', 'PKMSOperationResponse']
]) {
  const schema = realtime.$defs[schemaName]
  compare(
    `Realtime ${schemaName} fields vs ${swiftName}`,
    new Set(Object.keys(schema.properties)),
    swiftModel(swiftName).fields
  )
  compare(
    `Realtime ${schemaName} required fields vs ${swiftName}`,
    new Set(schema.required),
    swiftModel(swiftName).required
  )
}

const envelopeNames = realtime.oneOf.map((reference) => reference.$ref.split('/').at(-1))
const envelopes = envelopeNames.map((name) => realtime.$defs[name])
const realtimeFields = new Set(
  envelopes.flatMap((definition) => Object.keys(definition.properties ?? {}))
)
const realtimeModel = tsModel('PkmsRealtimeMessage')
compare('Realtime schema fields vs PkmsRealtimeMessage', realtimeFields, realtimeModel.fields)
const schemaMessageTypes = new Set(
  envelopes.flatMap((definition) => {
    const value = definition.properties?.type?.const
    return typeof value === 'string' ? [value] : []
  })
)
schemaMessageTypes.add('operation')
const typeAlias = tsSource.statements.find(
  (item) => ts.isTypeAliasDeclaration(item) && item.name.text === 'PkmsRealtimeMessageType'
)
if (!typeAlias) throw new Error('TypeScript PkmsRealtimeMessageType is missing')
const tsMessageTypes = new Set(
  typeAlias.type.kind === ts.SyntaxKind.UnionType
    ? typeAlias.type.types
        .filter(ts.isLiteralTypeNode)
        .map((node) => node.literal)
        .filter(ts.isStringLiteral)
        .map((node) => node.text)
    : []
)
compare(
  'Realtime schema discriminators vs PkmsRealtimeMessageType',
  schemaMessageTypes,
  tsMessageTypes
)

console.log('Realtime models match message fields, discriminators, and peer schema.')
