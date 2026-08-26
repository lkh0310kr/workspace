import * as fs from "node:fs";
import * as path from "node:path";
import { LAYOUT_EXPORT_FILE_VERSION, LAYOUT_EXPORT_REL_PATH } from "./layoutSchema";

export interface LayoutExportTab {
  id: number;
  title: string;
  layoutJson: string;
}

export interface LayoutExportFile {
  schemaVersion: number;
  exportedAt: string;
  activeTabId: number;
  tabs: LayoutExportTab[];
}

export interface LayoutExportTabInput {
  id: number;
  title: string;
  layoutJson: string;
  rootPath: string;
}

export function layoutExportPath(rootPath: string): string {
  return path.join(rootPath, LAYOUT_EXPORT_REL_PATH);
}

export function buildLayoutExportFile(
  tabs: LayoutExportTabInput[],
  activeTabId: number,
  rootPath: string,
  exportedAt = new Date().toISOString(),
): LayoutExportFile | null {
  const forRoot = tabs.filter((t) => t.rootPath === rootPath);
  if (forRoot.length === 0) return null;
  const active = forRoot.some((t) => t.id === activeTabId) ? activeTabId : forRoot[0].id;
  return {
    schemaVersion: LAYOUT_EXPORT_FILE_VERSION,
    exportedAt,
    activeTabId: active,
    tabs: forRoot.map(({ id, title, layoutJson }) => ({ id, title, layoutJson })),
  };
}

/** Best-effort mirror of workspace layouts into each tab root's `.workspace/layout.json`. */
export function exportLayoutFiles(tabs: LayoutExportTabInput[], activeTabId: number): void {
  const roots = [...new Set(tabs.map((t) => t.rootPath))];
  for (const rootPath of roots) {
    const file = buildLayoutExportFile(tabs, activeTabId, rootPath);
    if (!file) continue;
    const outPath = layoutExportPath(rootPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(file, null, 2));
  }
}
