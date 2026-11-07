import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { ebookLocationKey, mergeEbookState, type EbookBookState } from "../shared/ebookState";
import { appSupportDir } from "./persistence";

function statePath(): string {
  if (process.env.WORKSPACE_TEST_EBOOK_STATE) return process.env.WORKSPACE_TEST_EBOOK_STATE;
  return path.join(appSupportDir(), "ebook-state.json");
}

function readStore(): Record<string, EbookBookState> {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, EbookBookState>;
    }
  } catch {
    /* missing or invalid */
  }
  return {};
}

function writeStore(store: Record<string, EbookBookState>): void {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`);
  try {
    renameSync(temp, file);
  } catch {
    rmSync(file, { force: true });
    renameSync(temp, file);
  }
}

export function getEbookState(bookPath: string): EbookBookState {
  const stored = readStore()[ebookLocationKey(bookPath)];
  return mergeEbookState(stored, {});
}

export function saveEbookState(bookPath: string, patch: Partial<EbookBookState>): EbookBookState {
  const store = readStore();
  const key = ebookLocationKey(bookPath);
  const next = mergeEbookState(store[key], {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  store[key] = next;
  writeStore(store);
  return next;
}
