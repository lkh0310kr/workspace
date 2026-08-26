import { z } from "zod";
import { defaultLayoutJson } from "./layoutDefaults";
import { PANE_GROUP_SCHEMA_VERSION } from "./layoutSchema";

export const TAB_KINDS = ["terminal", "browser", "code", "markdown", "viewer"] as const;
export type TabKind = (typeof TAB_KINDS)[number];

const TabKindSchema = z.enum(TAB_KINDS);

const PaneTabItemSchema = z
  .object({
    id: z.string().min(1),
    kind: TabKindSchema,
    terminalId: z.number().int().nonnegative().optional(),
    filePath: z.string().nullable().optional(),
    url: z.string().optional(),
    favicon: z.string().optional(),
    zoomFactor: z.number().positive().finite().optional(),
    title: z.string().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.kind === "terminal" && typeof item.terminalId !== "number") {
      ctx.addIssue({ code: "custom", message: "terminal tab requires terminalId" });
    }
  });

export type SalvagedPaneTabItem = z.infer<typeof PaneTabItemSchema>;

const PaneGroupConfigSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  tabs: z.array(PaneTabItemSchema).min(1),
  activeTabId: z.string().min(1),
  zoom: z.number().positive().finite().optional(),
});

export type SalvagedPaneGroupConfig = z.infer<typeof PaneGroupConfigSchema> & {
  schemaVersion: number;
};

export function salvagePaneTabItem(raw: unknown): SalvagedPaneTabItem | null {
  const parsed = PaneTabItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function salvagePaneGroupConfig(raw: unknown): SalvagedPaneGroupConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tabs)) return null;

  const tabs: SalvagedPaneTabItem[] = [];
  for (const entry of record.tabs) {
    const salvaged = salvagePaneTabItem(entry);
    if (salvaged) tabs.push(salvaged);
  }
  if (tabs.length === 0) return null;

  const activeTabId =
    typeof record.activeTabId === "string" && tabs.some((t) => t.id === record.activeTabId)
      ? record.activeTabId
      : tabs[0].id;

  const zoom = typeof record.zoom === "number" && record.zoom > 0 ? record.zoom : undefined;
  return {
    schemaVersion: PANE_GROUP_SCHEMA_VERSION,
    tabs,
    activeTabId,
    ...(zoom !== undefined ? { zoom } : {}),
  };
}

function migrateLegacyTabNode(record: Record<string, unknown>): boolean {
  if (record.component === "tabgroup") return false;
  const legacyKind = record.component;
  if (typeof legacyKind !== "string" || !TAB_KINDS.includes(legacyKind as TabKind)) return false;

  const legacyConfig = (record.config ?? {}) as Record<string, unknown>;
  const id = (record.id as string | undefined) ?? `legacy-${legacyKind}`;
  const item: SalvagedPaneTabItem = {
    id,
    kind: legacyKind as TabKind,
    terminalId: legacyConfig.terminalId as number | undefined,
    filePath: legacyConfig.filePath as string | null | undefined,
    url: legacyConfig.url as string | undefined,
  };
  const groupConfig = salvagePaneGroupConfig({
    tabs: [item],
    activeTabId: id,
    zoom: legacyConfig.zoom,
  });
  if (!groupConfig) return false;
  record.component = "tabgroup";
  record.config = groupConfig;
  return true;
}

function normalizeLayoutNode(node: unknown, changed: { value: boolean }): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;

  if (record.type === "tabset") {
    record.enableTabStrip = false;
    record.enableSingleTabStretch = false;
  }

  if (record.type === "tab") {
    if (migrateLegacyTabNode(record)) changed.value = true;
    if (record.component === "tabgroup") {
      const salvaged = salvagePaneGroupConfig(record.config);
      if (!salvaged) {
        delete record.config;
        changed.value = true;
      } else if (JSON.stringify(record.config) !== JSON.stringify(salvaged)) {
        record.config = salvaged;
        changed.value = true;
      }
    }
  }

  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) normalizeLayoutNode(child, changed);
  }
}

export type SalvageLayoutResult = {
  json: string;
  salvaged: boolean;
};

/**
 * Parse and validate layout JSON at the persistence boundary.
 * Drops invalid pane tab entries; falls back to defaultLayoutJson when the tree is unusable.
 */
export function salvageLayoutJson(
  json: string,
  fallbackTerminalId = 0,
): SalvageLayoutResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { json: defaultLayoutJson(fallbackTerminalId), salvaged: true };
  }

  if (!parsed || typeof parsed !== "object") {
    return { json: defaultLayoutJson(fallbackTerminalId), salvaged: true };
  }

  const model = parsed as Record<string, unknown>;
  const changed = { value: false };

  const savedGlobal =
    model.global && typeof model.global === "object" ? (model.global as Record<string, unknown>) : {};
  model.global = {
    ...savedGlobal,
    tabEnableClose: true,
    tabSetEnableMaximize: false,
    tabSetEnableDrop: savedGlobal.tabSetEnableDrop ?? true,
    tabSetEnableTabStrip: false,
    tabSetEnableSingleTabStretch: false,
    tabEnableRenderOnDemand: false,
    tabEnableRename: false,
  };

  if (!model.layout || typeof model.layout !== "object") {
    return { json: defaultLayoutJson(fallbackTerminalId), salvaged: true };
  }

  normalizeLayoutNode(model.layout, changed);

  const layout = model.layout as { type?: string };
  if (layout.type === "tabset") {
    model.layout = { type: "row", children: [layout] };
    changed.value = true;
  }

  // If every tab group was stripped, replace with default.
  let hasTabGroup = false;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "tab" && record.component === "tabgroup" && record.config) {
      hasTabGroup = true;
    }
    const children = record.children;
    if (Array.isArray(children)) for (const child of children) walk(child);
  };
  walk(model.layout);
  if (!hasTabGroup) {
    return { json: defaultLayoutJson(fallbackTerminalId), salvaged: true };
  }

  const nextJson = JSON.stringify(model);
  const salvaged = changed.value || nextJson !== json;
  return { json: nextJson, salvaged };
}
