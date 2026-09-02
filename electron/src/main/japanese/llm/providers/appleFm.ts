import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import type { StudyAssistRequest } from "../../../../shared/japaneseStudyTypes";
import { buildStudyPrompt, parseLineResponse } from "../prompts";
import { studyAssistLog } from "../../studyAssistLog";
import type { StudyLlmProvider } from "../types";

const SIDECAR_NAME = "apple-fm-sidecar";

function electronRepoRoot(): string | null {
  try {
    const appPath = app.getAppPath();
    if (appPath && existsSync(join(appPath, "resources", "japanese", SIDECAR_NAME, SIDECAR_NAME))) {
      return appPath;
    }
    const parent = join(appPath, "..");
    if (existsSync(join(parent, "resources", "japanese", SIDECAR_NAME, SIDECAR_NAME))) {
      return parent;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveAppleFmSidecarPath(): string | null {
  const candidates: string[] = [];
  const moduleDir = fileURLToPath(new URL(".", import.meta.url));
  candidates.push(join(moduleDir, "../../../../../resources/japanese", SIDECAR_NAME, SIDECAR_NAME));

  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, "japanese", SIDECAR_NAME, SIDECAR_NAME));
  }

  const repoRoot = electronRepoRoot();
  if (repoRoot) {
    candidates.push(join(repoRoot, "resources", "japanese", SIDECAR_NAME, SIDECAR_NAME));
  }

  const cwd = process.cwd();
  candidates.push(join(cwd, "resources", "japanese", SIDECAR_NAME, SIDECAR_NAME));
  candidates.push(join(cwd, "electron", "resources", "japanese", SIDECAR_NAME, SIDECAR_NAME));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      studyAssistLog("apple_fm_sidecar_path", { path: candidate });
      return candidate;
    }
  }
  studyAssistLog("apple_fm_sidecar_missing", { tried: candidates });
  return null;
}

function runSidecar(binary: string, payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `apple-fm sidecar exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { ok: boolean; content?: string; error?: string };
        if (!parsed.ok) {
          reject(new Error(parsed.error ?? "apple-fm sidecar failed"));
          return;
        }
        resolve(parsed.content ?? "");
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export function createAppleFmStudyLlmProvider(): StudyLlmProvider {
  return {
    id: "apple-fm",
    label: "Apple Intelligence (on-device)",
    async available() {
      if (process.platform !== "darwin") return false;
      return resolveAppleFmSidecarPath() != null;
    },
    async complete(req: StudyAssistRequest) {
      const binary = resolveAppleFmSidecarPath();
      if (!binary) {
        throw new Error(
          "Apple FM sidecar not found. Run: cd electron && npm run japanese:build-apple-fm-sidecar",
        );
      }
      const { system, user } = buildStudyPrompt(req);
      studyAssistLog("apple_fm_request", { task: req.task, binary });
      const content = await runSidecar(binary, {
        task: req.task,
        text: req.text,
        level: req.level ?? "auto",
        koreanDraft: req.koreanDraft ?? null,
        system,
        user,
      });
      studyAssistLog("apple_fm_response", { task: req.task, contentLength: content.length });
      return parseLineResponse(content, req.task);
    },
  };
}
