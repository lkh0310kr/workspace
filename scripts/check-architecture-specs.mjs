import { createHash } from 'node:crypto'
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Run from any directory. Refresh only after reviewing source/spec changes.
const root = fileURLToPath(new URL('../', import.meta.url))
const indexPath = path.join(root, 'docs/architecture/spec-index.json')
const refresh = process.argv.includes('--refresh')
if (process.argv.slice(2).some((arg) => arg !== '--refresh')) {
  throw new Error('Usage: node scripts/check-architecture-specs.mjs [--refresh]')
}
const index = JSON.parse(await readFile(indexPath, 'utf8'))
const errors = []
let checkedSources = 0
const documents = new Set(index.documents ?? [])
for (const module of index.modules) {
  module.documents.forEach((doc) => documents.add(doc))
  for (const source of module.sources) {
    try {
      const bytes = await readFile(path.join(root, source.path))
      const digest = createHash('sha256').update(bytes).digest('hex')
      checkedSources++
      if (refresh) source.sha256 = digest
      else if (source.sha256 !== digest) errors.push(`Source drift [${module.id}]: ${source.path}`)
    } catch (error) {
      errors.push(`Missing/unreadable source: ${source.path} (${error.code ?? error.message})`)
    }
  }
}
for (const doc of documents) {
  try {
    const content = await readFile(path.join(root, doc), 'utf8')
    const prose = content.replace(/```[^\n]*\n[\s\S]*?```/g, '')
    for (const match of prose.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1]
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue
      const target = href.split('#')[0]
      if (!target) continue
      try {
        await access(path.resolve(root, path.dirname(doc), decodeURIComponent(target)))
      } catch {
        errors.push(`Broken local link: ${doc} -> ${href}`)
      }
    }
  } catch (error) {
    errors.push(`Missing/unreadable document: ${doc} (${error.code ?? error.message})`)
  }
}
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`)
  process.exitCode = 1
} else {
  if (refresh) await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
  console.log(
    `${refresh ? 'Refreshed' : 'Checked'} ${index.modules.length} modules, ${documents.size} documents, ${checkedSources} source digests; local links valid.`
  )
}
