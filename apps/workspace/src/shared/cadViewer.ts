/** CAD Viewer (cadgen viewer) — shared types and URL helpers. */

export const CAD_VIEWER_EXTENSIONS = [
  ".urdf",
  ".srdf",
  ".sdf",
  ".dxf",
] as const;

export type CadViewerExtension = (typeof CAD_VIEWER_EXTENSIONS)[number];

export type CadViewerLaunchJson = {
  url: string;
  port: number;
  action?: "started" | "reused";
};

export type CadViewerOpenResult =
  | {
      ok: true;
      url: string;
      port: number;
      serveRoot: string;
      relativeFile: string;
      action: "started" | "reused";
    }
  | { ok: false; error: string };

export function isCadViewerExtension(pathOrName: string): boolean {
  const lower = pathOrName.toLowerCase();
  return CAD_VIEWER_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Build the viewer deep link for a file relative to the served workspace root. */
export function buildCadViewerFileUrl(port: number, relativeFile: string, host = "127.0.0.1"): string {
  const file = relativeFile.replace(/\\/g, "/").replace(/^\.\//, "");
  return `http://${host}:${port}/?file=${encodeURIComponent(file)}`;
}

/** Parse the JSON line cadgen viewer prints with --json (last JSON object in output). */
export function parseCadViewerLaunchJson(stdout: string): CadViewerLaunchJson | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Partial<CadViewerLaunchJson>;
      if (typeof parsed.url === "string" && typeof parsed.port === "number") {
        return { url: parsed.url, port: parsed.port, action: parsed.action };
      }
    } catch {
      /* try earlier line */
    }
  }
  return null;
}
