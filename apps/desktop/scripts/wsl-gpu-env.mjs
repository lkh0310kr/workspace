import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** True when running inside WSL (Windows Subsystem for Linux). */
export function isWsl() {
  if (process.platform !== 'linux') return false
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

/** WSLg D3D12 GPU passthrough via Mesa — must be set before Electron starts. */
export function applyWslGpuEnv(env = process.env) {
  if (!isWsl()) return env

  const backend = env.WORKSPACE_GL?.trim().toLowerCase()
  if (backend === 'swiftshader' || backend === 'off') return env

  if (existsSync('/dev/dxg')) {
    if (!env.GALLIUM_DRIVER) env.GALLIUM_DRIVER = 'd3d12'
    const wslLib = '/usr/lib/wsl/lib'
    if (existsSync(path.join(wslLib, 'libd3d12.so'))) {
      const cur = env.LD_LIBRARY_PATH ?? ''
      if (!cur.split(':').includes(wslLib)) {
        env.LD_LIBRARY_PATH = cur ? `${wslLib}:${cur}` : wslLib
      }
    }
  }

  return env
}
