import http from "node:http";
import https from "node:https";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Workspace/1.0 (Dashboard)",
};

function nodeHttpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: DEFAULT_HEADERS },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", reject);
  });
}

/** HTTP GET for dashboard widgets — prefers Electron net.fetch, then Node https. */
export async function fetchDashboardJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  if (process.versions.electron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { net } = require("electron") as typeof import("electron");
      if (typeof net.fetch === "function") {
        const response = await net.fetch(url, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          throw new Error(`request failed (${response.status})`);
        }
        return (await response.json()) as T;
      }
    } catch {
      /* fall through to node https */
    }
  }

  const { status, body } = await nodeHttpGet(url, timeoutMs);
  if (status < 200 || status >= 300) {
    throw new Error(`request failed (${status})`);
  }
  return JSON.parse(body) as T;
}
