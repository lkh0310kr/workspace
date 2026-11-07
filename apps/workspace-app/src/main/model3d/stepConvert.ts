import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { findAgentsPython } from "../cadViewer";

export type StepConvertResult =
  | { ok: true; glbPath: string; warnings: string[] }
  | { ok: false; error: string };

type ExistsFn = (p: string) => boolean;

function defaultExists(p: string): boolean {
  return existsSync(p);
}

/** Resolve `cadgen` next to `.agents/.venv` python (text-to-cad setup). */
export function findCadgenBinary(
  workspaceRoot: string,
  exists: ExistsFn = defaultExists,
): string | null {
  const python = findAgentsPython(workspaceRoot, exists);
  if (!python) return null;
  const name = process.platform === "win32" ? "cadgen.exe" : "cadgen";
  const candidate = path.join(path.dirname(python), name);
  return exists(candidate) ? candidate : null;
}

function parseCadgenJsonLine(stdout: string): { outcome?: string; document?: string } | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as { outcome?: string; document?: string };
    } catch {
      /* try earlier */
    }
  }
  return null;
}

/** Tessellate STEP/STP to GLB via cadgen (OCCT delegate — Phase 52). */
export function convertStepToGlb(
  cadgenBin: string,
  absoluteStep: string,
  absoluteGlb: string,
  workspaceRoot: string,
): Promise<StepConvertResult> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const child = spawn(
      cadgenBin,
      ["glb", "build", absoluteStep, absoluteGlb, "--json", "--force"],
      {
        cwd: workspaceRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    const onData = (buf: Buffer) => {
      chunks.push(buf.toString("utf8"));
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const finish = (result: StepConvertResult) => {
      resolve(result);
    };

    child.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });

    child.on("exit", (code) => {
      const combined = chunks.join("").trim();
      if (code !== 0) {
        const tail = combined.slice(-600);
        finish({
          ok: false,
          error: `STEP conversion failed (${code ?? "unknown"})${tail ? `: ${tail}` : ""}`,
        });
        return;
      }
      if (!existsSync(absoluteGlb)) {
        finish({ ok: false, error: "STEP conversion produced no GLB output" });
        return;
      }
      const parsed = parseCadgenJsonLine(combined);
      const warnings: string[] = [];
      if (parsed?.outcome && parsed.outcome !== "built" && parsed.outcome !== "current") {
        warnings.push(`cadgen outcome: ${parsed.outcome}`);
      }
      finish({ ok: true, glbPath: absoluteGlb, warnings });
    });
  });
}
