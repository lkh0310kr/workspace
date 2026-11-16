import type { TerminalDisplayServer } from './pane-manager-types'

export type TerminalWebglAutoDecision = {
  allowWebgl: boolean
  reason:
    | 'non-linux'
    | 'linux-wayland'
    | 'linux-hardware-renderer'
    | 'linux-webgl2-unavailable'
    | 'linux-renderer-unavailable'
    | 'linux-software-renderer'
  renderer: string | null
  vendor: string | null
}

const cachedDecisions = new Map<TerminalDisplayServer, TerminalWebglAutoDecision>()

const LINUX_SOFTWARE_RENDERER_PATTERN =
  /\b(swiftshader|llvmpipe|softpipe|software rasterizer|software adapter|basic render|virgl|svga3d)\b/i

export function resetTerminalWebglAutoDecision(): void {
  cachedDecisions.clear()
}

export function isLinuxRendererHost(
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform,
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  if (userAgent.startsWith('Node.js/')) {
    return false
  }
  return platform.includes('Linux') || userAgent.includes('Linux')
}

function readWebglRendererInfo(): Pick<TerminalWebglAutoDecision, 'renderer' | 'vendor'> & {
  hasWebgl2: boolean
  hasRendererInfo: boolean
} {
  if (typeof document === 'undefined') {
    return { hasWebgl2: false, hasRendererInfo: false, renderer: null, vendor: null }
  }

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      return { hasWebgl2: false, hasRendererInfo: false, renderer: null, vendor: null }
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) {
      return { hasWebgl2: true, hasRendererInfo: false, renderer: null, vendor: null }
    }

    const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
    const vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? '')
    return {
      hasWebgl2: true,
      hasRendererInfo: renderer.length > 0 || vendor.length > 0,
      renderer: renderer || null,
      vendor: vendor || null
    }
  } catch {
    return { hasWebgl2: false, hasRendererInfo: false, renderer: null, vendor: null }
  }
}

export function getTerminalWebglAutoDecision(
  displayServer: TerminalDisplayServer = null
): TerminalWebglAutoDecision {
  const cachedDecision = cachedDecisions.get(displayServer)
  if (cachedDecision) {
    return cachedDecision
  }

  if (!isLinuxRendererHost()) {
    const decision: TerminalWebglAutoDecision = {
      allowWebgl: true,
      reason: 'non-linux',
      renderer: null,
      vendor: null
    }
    cachedDecisions.set(displayServer, decision)
    return decision
  }

  if (displayServer === 'wayland') {
    // Wayland WebGL context creation can wedge terminal input before xterm
    // reports a recoverable context-loss event.
    const decision: TerminalWebglAutoDecision = {
      allowWebgl: false,
      reason: 'linux-wayland',
      renderer: null,
      vendor: null
    }
    cachedDecisions.set(displayServer, decision)
    return decision
  }

  const rendererInfo = readWebglRendererInfo()
  if (!rendererInfo.hasWebgl2) {
    const decision: TerminalWebglAutoDecision = {
      allowWebgl: false,
      reason: 'linux-webgl2-unavailable',
      renderer: rendererInfo.renderer,
      vendor: rendererInfo.vendor
    }
    cachedDecisions.set(displayServer, decision)
    return decision
  }

  if (!rendererInfo.hasRendererInfo) {
    // Why: the Linux corruption path can leave WebGL alive while glyphs are bad;
    // without renderer identity we cannot distinguish hardware from software GL.
    const decision: TerminalWebglAutoDecision = {
      allowWebgl: false,
      reason: 'linux-renderer-unavailable',
      renderer: rendererInfo.renderer,
      vendor: rendererInfo.vendor
    }
    cachedDecisions.set(displayServer, decision)
    return decision
  }

  const identity = `${rendererInfo.vendor ?? ''} ${rendererInfo.renderer ?? ''}`
  if (LINUX_SOFTWARE_RENDERER_PATTERN.test(identity)) {
    const decision: TerminalWebglAutoDecision = {
      allowWebgl: false,
      reason: 'linux-software-renderer',
      renderer: rendererInfo.renderer,
      vendor: rendererInfo.vendor
    }
    cachedDecisions.set(displayServer, decision)
    return decision
  }

  const decision: TerminalWebglAutoDecision = {
    allowWebgl: true,
    reason: 'linux-hardware-renderer',
    renderer: rendererInfo.renderer,
    vendor: rendererInfo.vendor
  }
  cachedDecisions.set(displayServer, decision)
  return decision
}
