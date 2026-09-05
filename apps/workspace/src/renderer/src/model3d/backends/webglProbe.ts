export type WebGLProbeResult = { ok: true } | { ok: false; reason: string };

/** Lightweight probe — creates and immediately releases a WebGL context. */
export function probeWebGL(): WebGLProbeResult {
  if (typeof document === "undefined") {
    return { ok: false, reason: "WebGL probe unavailable (no document)." };
  }

  try {
    const canvas = document.createElement("canvas");
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false };
    const gl =
      canvas.getContext("webgl2", attrs) ??
      canvas.getContext("webgl", attrs) ??
      canvas.getContext("experimental-webgl", attrs);
    if (!gl) {
      return {
        ok: false,
        reason:
          "WebGL is not available. On WSL/Linux, run the Electron app (not the Vite URL in a browser). If the problem persists, check GPU drivers or close other 3D panes.",
      };
    }
    const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `WebGL probe failed: ${message}` };
  }
}
