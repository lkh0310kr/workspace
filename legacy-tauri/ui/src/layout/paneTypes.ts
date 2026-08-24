export type PaneComponent = "code" | "markdown" | "terminal" | "browser";

export interface PaneConfig {
  terminalId?: number;
  filePath?: string;
  url?: string;
  // Cmd+'+'/Cmd+'-' per-pane text zoom (App.tsx's zoomActivePane), 1 = 100%.
  zoom?: number;
}

export const PANE_OPTIONS: { id: PaneComponent; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "⌘" },
  { id: "browser", label: "Browser", icon: "🌐" },
  { id: "code", label: "Code", icon: "{}" },
  { id: "markdown", label: "Markdown", icon: "M↓" },
];

export function paneLabel(component: PaneComponent): string {
  return PANE_OPTIONS.find((p) => p.id === component)?.label ?? component;
}
