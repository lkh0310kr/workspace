/**
 * Electron main entry for WebGL probe — applies same switches as browserGpuEnv.ts.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'

function isWsl() {
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

function resolveGlBackend() {
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
      return isWsl() ? 'angle-gl' : 'auto'
  }
}

function applySwitches() {
  if (process.platform !== 'linux') return
  const backend = resolveGlBackend()
  const append = (name, value) => {
    if (value === undefined) app.commandLine.appendSwitch(name)
    else app.commandLine.appendSwitch(name, value)
  }

  append('enable-webgl')
  append('ignore-gpu-blocklist')

  if (backend === 'off') {
    append('disable-gpu')
    return
  }

  append('enable-gpu')
  append('disable-gpu-sandbox')

  const useSwiftshader = backend === 'swiftshader'
  const useAngleGl = backend === 'angle-gl' || (backend === 'auto' && isWsl())
  const useEgl = backend === 'egl'
  const useD3d11 = backend === 'd3d11' || backend === 'gpu' || (backend === 'auto' && !isWsl())

  if (useSwiftshader) {
    append('use-gl', 'angle')
    append('use-angle', 'swiftshader')
    return
  }
  if (useAngleGl) {
    append('use-gl', 'angle')
    append('use-angle', 'gl')
    return
  }
  if (useEgl) {
    append('use-gl', 'egl')
    return
  }
  if (useD3d11) {
    append('enable-gpu-rasterization')
    append('use-gl', 'angle')
    if (isWsl()) append('use-angle', 'd3d11')
  }
}

applySwitches()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true },
  })
  await win.loadURL('data:text/html,<body></body>')
  const result = await win.webContents.executeJavaScript(`(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
      || c.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    if (!gl) return { ok: false, backend: ${JSON.stringify(resolveGlBackend())}, reason: 'no context' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ok: true,
      backend: ${JSON.stringify(resolveGlBackend())},
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    };
  })()`)
  console.log('WEBGL_PROBE_RESULT:' + JSON.stringify(result))
  app.exit(result.ok ? 0 : 1)
})

app.on('window-all-closed', () => app.quit())
