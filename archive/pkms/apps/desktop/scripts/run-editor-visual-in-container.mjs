import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const packageLock = await readFile('package-lock.json')
const lockHash = createHash('sha256').update(packageLock).digest('hex')
const installMarker = path.join('node_modules', '.editor-visual-install')
let installedHash = ''
try {
  installedHash = (await readFile(installMarker, 'utf8')).trim()
} catch {
  // The persistent Docker volume is empty on its first run.
}

if (process.env.CI !== '1' && installedHash !== lockHash) {
  const install = spawnSync('npm', ['ci', '--ignore-scripts'], { stdio: 'inherit' })
  if (install.error) throw install.error
  if (install.status !== 0) process.exit(install.status ?? 1)
  await writeFile(installMarker, lockHash)
}

const test = spawnSync(
  path.join('node_modules', '.bin', 'playwright'),
  ['test', '--config', 'visual-tests/editor-parity/playwright.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit' }
)
if (test.error) throw test.error
process.exitCode = test.status ?? 1
