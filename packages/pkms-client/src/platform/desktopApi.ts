interface DesktopRequestPart {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
  bytes?: Uint8Array;
}

interface DesktopBridge {
  request<T = unknown>(path: string, options: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: { kind: "json"; value: string } | { kind: "multipart"; parts: DesktopRequestPart[] };
  }): Promise<{ status: number; requestId?: string; body: T }>;
  fetchAsset(path: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  openVerification(url: string): Promise<void>;
  syncBridgeStatus(workspaceId: string): Promise<PkmsSyncBridgeStatus>;
  connectSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeConnectResult>;
  disconnectSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus>;
  scanSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus>;
  updateSyncBridgeExclusions(workspaceId: string, paths: string[]): Promise<PkmsSyncBridgeStatus>;
}

export interface PkmsSyncBridgeStatus {
  workspaceId: string;
  enabled: boolean;
  folderPath: string | null;
  excludedPaths: string[];
  state: "disconnected" | "syncing" | "synced" | "offline" | "error";
  lastScannedAt: number | null;
  lastSyncedAt: number | null;
  pendingFiles: number;
  conflictFiles: string[];
  error: string | null;
}

export type PkmsSyncBridgeConnectResult =
  | { canceled: true }
  | { canceled: false; status: PkmsSyncBridgeStatus };

export function desktopBridge(): DesktopBridge | null {
  return (window as Window & { pkmsDesktop?: DesktopBridge }).pkmsDesktop ?? null;
}

export async function requestDesktopApi<T>(path: string, init?: RequestInit): Promise<T> {
  const desktop = desktopBridge();
  if (!desktop) throw new Error("desktop_transport_unavailable");

  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  let body: { kind: "json"; value: string } | { kind: "multipart"; parts: DesktopRequestPart[] } | undefined;
  if (typeof init?.body === "string") body = { kind: "json", value: init.body };
  else if (init?.body instanceof FormData) {
    const parts: DesktopRequestPart[] = [];
    for (const [name, value] of init.body.entries()) {
      if (typeof value === "string") parts.push({ name, value });
      else parts.push({ name, fileName: value.name, contentType: value.type, bytes: new Uint8Array(await value.arrayBuffer()) });
    }
    body = { kind: "multipart", parts };
  }

  const result = await desktop.request<T>(path, {
    method: init?.method === "POST" ? "POST" : "GET",
    headers,
    body,
  });
  if (result.status < 200 || result.status >= 300) {
    const errorBody = result.body && typeof result.body === "object" ? result.body as { message?: string; error?: string; requestId?: string } : {};
    const message = errorBody.message ?? errorBody.error ?? `Request failed (${result.status})`;
    const requestId = result.requestId ?? errorBody.requestId;
    const error = new Error(`${message}${requestId ? ` · ${requestId}` : ""}`) as Error & { code?: string };
    error.code = errorBody.error;
    throw error;
  }
  return result.body as T;
}
