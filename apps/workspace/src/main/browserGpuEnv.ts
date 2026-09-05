import { isWsl } from './wslPaths'

/** WORKSPACE_GL — override Chromium GL backend (must be set before Electron starts). */
export type GlBackend = 'auto' | 'gpu' | 'd3d11' | 'angle-gl' | 'swiftshader' | 'egl' | 'off'

export function resolveGlBackend(): GlBackend {
  const raw = process.env.WORKSPACE_GL?.trim().toLowerCase()
  switch (raw) {
    case 'gpu':
    case 'd3d11':
    case 'angle-gl':
    case 'swiftshader':
    case 'egl':
    case 'off':
    case 'auto':
      return raw
    default:
      // WSLg: Mesa D3D12 (Intel/NVIDIA/AMD via /dev/dxg) — much faster than SwiftShader.
      return isWsl() ? 'angle-gl' : 'auto'
  }
}

/** Chromium GPU/WebGL switches — main process + browser webviews. */
export function applyBrowserGpuSwitches(appendSwitch: (name: string, value?: string) => void): void {
  if (process.platform !== 'linux') return

  const backend = resolveGlBackend()

  appendSwitch('enable-webgl')
  appendSwitch('ignore-gpu-blocklist')

  if (backend === 'off') {
    appendSwitch('disable-gpu')
    return
  }

  appendSwitch('enable-gpu')
  appendSwitch('disable-gpu-sandbox')

  const useSwiftshader = backend === 'swiftshader'
  const useAngleGl = backend === 'angle-gl' || (backend === 'auto' && isWsl())
  const useEgl = backend === 'egl'
  const useD3d11 = backend === 'd3d11' || backend === 'gpu' || (backend === 'auto' && !isWsl())

  if (useSwiftshader) {
    appendSwitch('use-gl', 'angle')
    appendSwitch('use-angle', 'swiftshader')
    return
  }

  if (useAngleGl) {
    appendSwitch('use-gl', 'angle')
    appendSwitch('use-angle', 'gl')
    return
  }

  if (useEgl) {
    appendSwitch('use-gl', 'egl')
    return
  }

  if (useD3d11) {
    appendSwitch('enable-gpu-rasterization')
    appendSwitch('use-gl', 'angle')
    if (isWsl()) appendSwitch('use-angle', 'd3d11')
  }
}

export function glBackendLabel(): string {
  return resolveGlBackend()
}
