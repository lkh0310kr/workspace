import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import { rgPath } from "@vscode/ripgrep";

// Find-in-Files / Quick Open backend — spawns the same rg binary VSCode
// bundles and drives the same way (ref-proj/vscode's
// ripgrepTextSearchEngine.ts: cp.spawn(rgPath, args, { cwd }), parse --json
// newline-delimited stdout), rather than reimplementing a slower/weaker
// pure-JS recursive grep that ignores .gitignore.

export interface SearchMatchRange {
  start: number;
  end: number;
}

export interface SearchMatch {
  lineNumber: number;
  lineText: string;
  ranges: SearchMatchRange[];
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  includeHidden?: boolean;
}

type RipgrepJsonEvent =
  | {
      type: "match";
      data: {
        path: { text: string };
        lines: { text: string };
        line_number: number;
        submatches: { start: number; end: number }[];
      };
    }
  | { type: "begin" | "end" | "summary" | "context"; data: unknown };

/** Parses one line of `rg --json` output into a file-relative match, or
 * null for event types this feature doesn't need (begin/end/summary) or a
 * line that isn't valid JSON (rg can interleave stderr-ish diagnostics on
 * rare malformed input — skip rather than crash the whole stream). Pure and
 * independently testable — no process spawn needed to exercise it. */
export function parseRipgrepMatchLine(
  line: string,
  root: string,
): { path: string; match: SearchMatch } | null {
  if (!line) return null;
  let event: RipgrepJsonEvent;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event.type !== "match") return null;
  const relPath = path.relative(root, event.data.path.text);
  return {
    path: relPath,
    match: {
      lineNumber: event.data.line_number,
      lineText: event.data.lines.text.replace(/\r?\n$/, ""),
      ranges: event.data.submatches.map((m) => ({ start: m.start, end: m.end })),
    },
  };
}

function buildSearchArgs(query: string, opts: SearchOptions): string[] {
  const args = ["--json", "--line-number", "--column"];
  args.push(opts.caseSensitive ? "--case-sensitive" : "--ignore-case");
  if (opts.wholeWord) args.push("--word-regexp");
  if (!opts.regex) args.push("--fixed-strings");
  if (opts.includeHidden) args.push("--hidden");
  args.push("--", query, ".");
  return args;
}

export interface ActiveSearch {
  cancel: () => void;
}

/**
 * Streams matches grouped by file as ripgrep finds them (`onFile` fires
 * once per file, with that file's full match list at end-of-stream for that
 * file) — VSCode's own Search view populates live the same way rather than
 * waiting for the whole search to finish before showing anything.
 */
export function searchInFiles(
  root: string,
  query: string,
  opts: SearchOptions,
  onFile: (result: SearchFileResult) => void,
  onDone: (error?: string) => void,
): ActiveSearch {
  const proc: ChildProcessWithoutNullStreams = spawn(rgPath, buildSearchArgs(query, opts), {
    cwd: root,
  });
  let buffer = "";
  const byFile = new Map<string, SearchFileResult>();
  let stderr = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseRipgrepMatchLine(line, root);
      if (!parsed) continue;
      let entry = byFile.get(parsed.path);
      if (!entry) {
        entry = { path: parsed.path, matches: [] };
        byFile.set(parsed.path, entry);
      }
      entry.matches.push(parsed.match);
      onFile(entry);
    }
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  proc.on("error", (err) => onDone(String(err)));
  proc.on("close", (code) => {
    // Why: rg exits 1 for "no matches" (not an error — an empty result set)
    // and 2 for a real failure (bad regex, unreadable root, etc).
    if (code === 2) onDone(stderr.trim() || `ripgrep exited with code ${code}`);
    else onDone();
  });

  return {
    cancel: () => {
      proc.kill();
    },
  };
}

/** All files under root respecting .gitignore, via `rg --files` (plain
 * newline-delimited paths — not the --json content-search mode). Backs
 * Quick Open as well as Find-in-Files' own default search scope. */
export function listAllFiles(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(rgPath, ["--files"], { cwd: root });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 2) {
        reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`));
        return;
      }
      resolve(stdout.split("\n").filter(Boolean));
    });
  });
}
