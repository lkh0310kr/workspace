import { ipcMain, safeStorage, shell } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { appSupportDir } from "./persistence";
import type {
  PkmsAssetResponse,
  PkmsRequestBody,
  PkmsRequestOptions,
  PkmsResponse,
  PkmsUploadPart,
} from "../shared/pkmsClient";

const PKMS_ORIGIN = "https://pkms-cloud.lkh0310kr.workers.dev";
let volatileSession: string | null = null;

function sessionPath(): string {
  return path.join(appSupportDir(), "pkms-session.safe");
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const rawUrl = event.senderFrame?.url;
  if (!rawUrl) throw new Error("untrusted_renderer");
  const url = new URL(rawUrl);
  const trusted = url.protocol === "file:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  if (!trusted) throw new Error("untrusted_renderer");
}

function readSession(): string | null {
  if (volatileSession) return volatileSession;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    volatileSession = safeStorage.decryptString(fs.readFileSync(sessionPath()));
    return volatileSession;
  } catch {
    return null;
  }
}

function writeSession(token: string): void {
  volatileSession = token;
  if (!safeStorage.isEncryptionAvailable()) return;
  const target = sessionPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, safeStorage.encryptString(token), { mode: 0o600 });
}

function clearSession(): void {
  volatileSession = null;
  try { fs.rmSync(sessionPath(), { force: true }); } catch { /* best effort */ }
}

function resolveApiPath(pathname: string): URL {
  const url = new URL(pathname, PKMS_ORIGIN);
  if (url.origin !== PKMS_ORIGIN || !url.pathname.startsWith("/api/") || url.username || url.password) {
    throw new Error("invalid_pkms_path");
  }
  return url;
}

function toFormData(body: PkmsRequestBody): BodyInit | undefined {
  if (body.kind === "json") return body.value;
  const form = new FormData();
  for (const part of body.parts as PkmsUploadPart[]) {
    if ("fileName" in part) {
      const bytes = part.bytes.buffer.slice(part.bytes.byteOffset, part.bytes.byteOffset + part.bytes.byteLength) as ArrayBuffer;
      form.append(part.name, new Blob([bytes], { type: part.contentType }), part.fileName);
    } else {
      form.append(part.name, part.value);
    }
  }
  return form;
}

async function request<T = unknown>(
  pathName: string,
  options: PkmsRequestOptions,
): Promise<PkmsResponse<T>> {
  const url = resolveApiPath(pathName);
  const headers = new Headers(options.headers);
  headers.delete("authorization");
  const session = readSession();
  if (session && url.pathname !== "/api/auth/device/start" && url.pathname !== "/api/auth/device/poll") {
    headers.set("Authorization", `Bearer ${session}`);
  }
  if (options.body?.kind === "json" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? toFormData(options.body) : undefined,
    redirect: "follow",
  });
  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 204 && contentType.includes("application/json")) {
    body = await response.json();
  }

  if (url.pathname === "/api/auth/device/poll" && response.ok && body && typeof body === "object") {
    const result = body as Record<string, unknown>;
    if (typeof result.token === "string") {
      writeSession(result.token);
      const { token: _token, ...safeResult } = result;
      body = safeResult;
    }
  }
  if (url.pathname === "/api/logout" && response.ok) clearSession();
  return { status: response.status, requestId, body: body as T };
}

export function registerPkmsIpc(): void {
  ipcMain.handle("pkms:request", (event, pathName: string, options: PkmsRequestOptions) => {
    assertTrustedSender(event);
    return request(pathName, options);
  });
  ipcMain.handle("pkms:fetch-asset", async (event, pathName: string): Promise<PkmsAssetResponse> => {
    assertTrustedSender(event);
    const url = resolveApiPath(pathName);
    if (!/^\/api\/workspaces\/[^/]+\/assets\/[^/]+$/.test(url.pathname)) {
      throw new Error("invalid_pkms_asset_path");
    }
    const headers = new Headers();
    const session = readSession();
    if (session) headers.set("Authorization", `Bearer ${session}`);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`asset_request_failed:${response.status}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
  });
  ipcMain.handle("pkms:open-verification", (event, rawUrl: string) => {
    assertTrustedSender(event);
    const url = new URL(rawUrl);
    if (url.origin !== "https://github.com" || url.pathname !== "/login/device") {
      throw new Error("invalid_verification_url");
    }
    return shell.openExternal(url.toString());
  });
}
