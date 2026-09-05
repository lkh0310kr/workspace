import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import {
  buildCadViewerFileUrl,
  parseCadViewerLaunchJson,
  type CadViewerOpenResult,
} from "../shared/cadViewer";

type ViewerInstance = {
  serveRoot: string;
  port: number;
  baseUrl: string;
  child: ChildProcess | null;
  lastAction: "started" | "reused";
};

const instances = new Map<string, ViewerInstance>();
const pendingLaunches = new Map<string, Promise<ViewerInstance>>();

export type CadViewerBinaryOptions = {
  appPath?: string;
  exists?: (p: string) => boolean;
};

function defaultExists(p: string): boolean {
  return existsSync(p);
}

function electronAppPath(): string {
  try {
    return app.getAppPath();
  } catch {
    return "";
  }
}

/** Walk upward from startDir looking for `.agents/.venv` (repo text-to-cad setup). */
export function findAgentsPython(
  startDir: string,
  exists: (p: string) => boolean = defaultExists,
): string | null {
  let dir = path.resolve(startDir);
  const pyName = process.platform === "win32" ? "python.exe" : "python";
  const scriptsDir = process.platform === "win32" ? "Scripts" : "bin";

  while (true) {
    const candidate = path.join(dir, ".agents", ".venv", scriptsDir, pyName);
    if (exists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function agentsPythonCandidates(options: CadViewerBinaryOptions = {}): string[] {
  const exists = options.exists ?? defaultExists;
  const out: string[] = [];
  const appPath = options.appPath ?? electronAppPath();
  if (appPath) {
    const fromApp = findAgentsPython(path.join(appPath, "..", ".."), exists);
    if (fromApp) out.push(fromApp);
  }
  const fromCwd = findAgentsPython(process.cwd(), exists);
  if (fromCwd && !out.includes(fromCwd)) out.push(fromCwd);
  return out;
}

function instanceKey(serveRoot: string): string {
  return realpathSync(serveRoot);
}

function launchViewerProcess(python: string, serveRoot: string): Promise<ViewerInstance> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const child = spawn(python, ["-m", "cadgen.viewer", "--host", "127.0.0.1", "--json"], {
      cwd: serveRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const onData = (buf: Buffer) => {
      chunks.push(buf.toString("utf8"));
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const fail = (message: string) => {
      child.kill();
      reject(new Error(message));
    };

    const timer = setTimeout(() => {
      fail("CAD Viewer startup timed out");
    }, 60_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (instances.has(instanceKey(serveRoot))) return;
      const detail = chunks.join("").trim();
      fail(
        `CAD Viewer exited (${code ?? signal ?? "unknown"})${detail ? `: ${detail.slice(-400)}` : ""}`,
      );
    });

    const tryResolve = () => {
      const parsed = parseCadViewerLaunchJson(chunks.join(""));
      if (!parsed) return false;
      clearTimeout(timer);
      const inst: ViewerInstance = {
        serveRoot,
        port: parsed.port,
        baseUrl: parsed.url,
        child,
        lastAction: parsed.action === "reused" ? "reused" : "started",
      };
      instances.set(instanceKey(serveRoot), inst);
      child.on("exit", () => {
        const key = instanceKey(serveRoot);
        const current = instances.get(key);
        if (current?.child === child) instances.delete(key);
      });
      resolve(inst);
      return true;
    };

    const interval = setInterval(() => {
      if (tryResolve()) clearInterval(interval);
    }, 50);
    child.stdout?.on("data", () => {
      if (tryResolve()) clearInterval(interval);
    });
  });
}

async function ensureViewerInstance(
  serveRoot: string,
  exists: (p: string) => boolean = defaultExists,
): Promise<ViewerInstance> {
  const key = instanceKey(serveRoot);
  const existing = instances.get(key);
  if (existing) {
    const alive = existing.child && existing.child.exitCode === null && !existing.child.killed;
    if (alive) return existing;
    instances.delete(key);
  }

  const inflight = pendingLaunches.get(key);
  if (inflight) return inflight;

  const python = agentsPythonCandidates({ exists })[0];
  if (!python) {
    throw new Error(
      "CAD Viewer Python not found. From the repo root run: npm run agents:python:setup",
    );
  }

  const launch = launchViewerProcess(python, serveRoot).finally(() => {
    pendingLaunches.delete(key);
  });
  pendingLaunches.set(key, launch);
  return launch;
}

export async function openCadViewerFile(
  serveRoot: string,
  relativeFile: string,
  exists: (p: string) => boolean = defaultExists,
): Promise<CadViewerOpenResult> {
  const normalized = relativeFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const absFile = path.join(serveRoot, normalized);
  if (!exists(absFile)) {
    return { ok: false, error: `File not found: ${normalized}` };
  }

  try {
    const inst = await ensureViewerInstance(serveRoot, exists);
    const url = buildCadViewerFileUrl(inst.port, normalized);
    return {
      ok: true,
      url,
      port: inst.port,
      serveRoot,
      relativeFile: normalized,
      action: inst.lastAction,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function cadViewerRunningCount(): number {
  return instances.size;
}

export function disposeCadViewers(): void {
  for (const inst of instances.values()) {
    inst.child?.kill();
  }
  instances.clear();
  pendingLaunches.clear();
}
