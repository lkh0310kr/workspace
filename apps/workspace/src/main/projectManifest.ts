import * as fs from "node:fs";
import * as path from "node:path";
import { appSupportDir } from "./persistence";
import {
  emptyProjectManifest,
  parseProjectManifest,
  upsertProjectApp,
  type ProjectAppEntry,
  type ProjectManifest,
} from "../shared/projectManifest";

// Persisted centrally (same appSupportDir() as config.electron.json/
// workspace.electron.json — see persistence.ts's doc comment for why:
// dev/packaged builds get separate directories), keyed by workspace root
// path, not as a file written into each project directory. Two reasons
// to prefer this over a per-project `<root>/.workspace/project.json`:
// (a) every other piece of this app's persisted state already lives here,
// one more file next to it is a smaller conceptual surface than a new
// per-project-directory convention; (b) a project root the user doesn't
// want a stray dotfile written into (an existing repo they didn't create)
// isn't an edge case to design around this way.
function projectManifestsPath(): string {
  return path.join(appSupportDir(), "projects.electron.json");
}

type ProjectManifestsByRoot = Record<string, ProjectManifest>;

function loadAll(): ProjectManifestsByRoot {
  try {
    const raw = fs.readFileSync(projectManifestsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ProjectManifestsByRoot = {};
    for (const [root, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[root] = parseProjectManifest(JSON.stringify(value));
    }
    return out;
  } catch {
    return {};
  }
}

function saveAll(all: ProjectManifestsByRoot): void {
  try {
    const p = projectManifestsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(all, null, 2));
  } catch {
    // Best-effort, same as persistence.ts's saveWorkspaceSnapshot — a
    // failed write here shouldn't fail whatever action triggered it.
  }
}

export function loadProjectManifest(rootPath: string): ProjectManifest {
  return loadAll()[rootPath] ?? emptyProjectManifest();
}

/** Adds/updates one app entry for `rootPath`'s project manifest, saves,
 * and returns the resulting manifest. See upsertProjectApp's own doc
 * comment for the (kind, path) dedup key. */
export function registerProjectApp(
  rootPath: string,
  entry: Omit<ProjectAppEntry, "addedAt">,
): ProjectManifest {
  const all = loadAll();
  const next = upsertProjectApp(all[rootPath] ?? emptyProjectManifest(), entry);
  all[rootPath] = next;
  saveAll(all);
  return next;
}
