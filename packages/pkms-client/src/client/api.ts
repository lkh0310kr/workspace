import { desktopBridge, requestDesktopApi } from "../platform/desktopApi";

export async function requestPkmsApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (desktopBridge()) return requestDesktopApi<T>(path, init);

  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string; requestId?: string };
    const requestId = response.headers.get("X-Request-ID") ?? body.requestId;
    const message = body.message ?? body.error ?? `Request failed (${response.status})`;
    const error = new Error(`${message}${requestId ? ` · ${requestId}` : ""}`) as Error & { code?: string };
    error.code = body.error;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
