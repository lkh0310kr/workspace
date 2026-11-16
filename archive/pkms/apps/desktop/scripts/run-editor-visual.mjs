import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const playwrightArgs = process.argv.slice(2)
const runner = process.platform === 'linux' ? 'node' : 'docker'
const args =
  runner === 'node'
    ? ['scripts/run-editor-visual-in-container.mjs', ...playwrightArgs]
    : [
        'run',
        '--rm',
        '-v',
        `${resolve(process.cwd(), '../..')}:/workspace`,
        '-v',
        'workspace-editor-visual-node-modules:/workspace/apps/desktop/node_modules',
        '-w',
        '/workspace/apps/desktop',
        'mcr.microsoft.com/playwright:v1.65.1-noble',
        'node',
        'scripts/run-editor-visual-in-container.mjs',
        ...playwrightArgs
      ]

const result = spawnSync(runner, args, { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
