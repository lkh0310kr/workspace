import { invoke } from "@tauri-apps/api/core";

export interface BrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://example.com";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function measureElementRect(element: HTMLElement): BrowserRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export async function browserReportFrame(
  paneId: string,
  url: string,
  rect: BrowserRect,
  visible: boolean,
): Promise<void> {
  return invoke("browser_report_frame", {
    paneId,
    url,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    visible,
  });
}

export async function browserNavigate(paneId: string, url: string): Promise<void> {
  return invoke("browser_navigate", { paneId, url });
}

export async function browserBack(paneId: string): Promise<void> {
  return invoke("browser_back", { paneId });
}

export async function browserForward(paneId: string): Promise<void> {
  return invoke("browser_forward", { paneId });
}

export async function browserReload(paneId: string): Promise<void> {
  return invoke("browser_reload", { paneId });
}

export async function browserToggleDevtools(paneId: string): Promise<boolean> {
  return invoke("browser_toggle_devtools", { paneId });
}

export async function browserDetach(paneId: string): Promise<void> {
  return invoke("browser_detach", { paneId });
}

export async function browserHideAll(): Promise<void> {
  return invoke("browser_hide_all");
}

export async function browserCleanupAll(): Promise<void> {
  return invoke("browser_cleanup_all");
}
