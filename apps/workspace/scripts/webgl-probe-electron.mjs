#!/usr/bin/env node
/**
 * Probe WebGL inside Electron for each WORKSPACE_GL profile.
 * Usage: node scripts/webgl-probe-electron.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyWslGpuEnv } from './wsl-gpu-env.mjs'

const ROOT = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ELECTRON = path.join(ROOT, 'node_modules', '.bin', 'electron')
const RUNNER = path.join(ROOT, 'scripts', 'webgl-probe-runner.mjs')

const PROFILES = ['angle-gl', 'swiftshader', 'd3d11', 'egl', 'gpu']

function probeProfile(profile) {
  const env = applyWslGpuEnv({
    ...process.env,
    WORKSPACE_GL: profile,
    ELECTRON_RUN_AS_NODE: undefined,
  })
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(ELECTRON, [RUNNER], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  })
  const combined = `${result.stdout}\n${result.stderr}`
  const match = combined.match(/WEBGL_PROBE_RESULT:(\{.*\})/)
  const parsed = match ? JSON.parse(match[1]) : null
  return {
    profile,
    ok: result.status === 0 && parsed?.ok === true,
    parsed,
    status: result.status,
    tail: combined.trim().split('\n').slice(-8).join('\n'),
  }
}

if (!existsSync(ELECTRON)) {
  console.error('Electron not found — run npm install in apps/workspace')
  process.exit(1)
}

console.log('Probing WebGL profiles in Electron (WSL/Linux)…\n')
const results = PROFILES.map(probeProfile)
let hwWinner = null
let anyWinner = null
for (const r of results) {
  const mark = r.ok ? 'OK' : 'FAIL'
  const hw = r.parsed?.renderer && !/swiftshader|llvmpipe/i.test(r.parsed.renderer) ? ' [HW]' : ''
  console.log(`[${mark}] WORKSPACE_GL=${r.profile}${hw}`)
  if (r.parsed) console.log(`       ${JSON.stringify(r.parsed)}`)
  else if (r.status !== 0) console.log(`       exit ${r.status}\n${r.tail}`)
  if (r.ok && !anyWinner) anyWinner = r.profile
  if (r.ok && hw && !hwWinner) hwWinner = r.profile
}

console.log('')
const recommended = hwWinner ?? anyWinner
if (recommended) {
  console.log(`Recommended: WORKSPACE_GL=${recommended}`)
  if (recommended === 'angle-gl') {
    console.log('(WSL default — uses Mesa D3D12 via /dev/dxg when available)')
  }
  process.exit(0)
}

console.error('No profile succeeded. Fallback: WORKSPACE_GL=swiftshader')
process.exit(1)
