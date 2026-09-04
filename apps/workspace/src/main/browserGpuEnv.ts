import { isWsl } from './wslPaths'

/** Chromium GPU/WebGL switches for browser <webview> guests (Godot Web, etc.). */
export function applyBrowserGpuSwitches(appendSwitch: (name: string, value?: string) => void): void {
  if (process.platform !== 'linux') return
  appendSwitch('ignore-gpu-blocklist')
  appendSwitch('enable-gpu-rasterization')
  appendSwitch('enable-webgl')
  if (isWsl()) {
    // WSLg: route GL through ANGLE/D3D instead of a broken llvmpipe guest stack.
    appendSwitch('use-angle', 'd3d11')
  }
}
