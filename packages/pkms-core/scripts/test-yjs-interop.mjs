import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as Y from '../../../apps/workspace-app/node_modules/yjs/dist/yjs.mjs'

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cargo = (args) =>
  execFileSync(
    'cargo',
    ['run', '--quiet', '-p', 'pkms-core', '--example', 'yjs-interop', '--', ...args],
    {
      cwd: packageDir,
      encoding: 'utf8'
    }
  ).trim()
const toHex = (bytes) => Buffer.from(bytes).toString('hex')
const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'))

// Create a Yjs update containing a non-BMP character. Yrs must interpret the
// insertion position as UTF-16 code units, matching JavaScript/CodeMirror.
const base = new Y.Doc()
base.clientID = 101
base.getText('markdown').insert(0, 'A🎸B')
const baseUpdate = toHex(Y.encodeStateAsUpdate(base))

const rustBranch = cargo(['insert', baseUpdate, '3', 'R'])
const jsBranchDoc = new Y.Doc()
Y.applyUpdate(jsBranchDoc, fromHex(baseUpdate))
jsBranchDoc.getText('markdown').insert(3, 'J')
const jsBranch = toHex(Y.encodeStateAsUpdate(jsBranchDoc))

const jsMerged = new Y.Doc()
Y.applyUpdate(jsMerged, fromHex(rustBranch))
Y.applyUpdate(jsMerged, fromHex(jsBranch))
const rustMerged = cargo(['merge', rustBranch, jsBranch])

assert.equal(jsMerged.getText('markdown').toString(), rustMerged)
assert.equal([...jsMerged.getText('markdown').toString()].length, 5)
assert.match(rustMerged, /^A🎸[JR]{2}B$/)

console.log(`Yjs ↔ Yrs interoperability passed: ${rustMerged}`)
