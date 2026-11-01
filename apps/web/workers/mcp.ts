import type { Env, Session } from "./env";
import { cookie, json, randomToken, signSession, verifySession } from "./crypto";
import { accountStore } from "./SupabaseAccountStore";

const encoder = new TextEncoder();
const STORE = "pkms-mcp-oauth";
const TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const AUTH_CODE_LIFETIME = 5 * 60 * 1000;
const SCOPES = new Set(["pkms:read", "pkms:write"]);
const PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOLS = new Set(["2025-03-26", "2025-06-18", "2025-11-25"]);

type Stored<T> = { value: T; expiresAt: number };
type OAuthClient = { clientId: string; clientName: string; redirectUris: string[] };
type AuthorizeRequest = { kind: "authorize"; clientId: string; redirectUri: string; clientState: string; challenge: string; scope: string[]; loginNonce: string };
type StartedAuthorize = { kind: "started"; githubState: string };
type AuthorizationCode = { kind: "code"; clientId: string; redirectUri: string; challenge: string; scope: string[]; login: string; avatarUrl?: string };
type Dependencies = {
  dispatchApi: (request: Request, env: Env, requestId: string) => Promise<Response>;
  saveGitHubGrant: (env: Env, grant: { access_token?: string; refresh_token?: string; expires_in?: number }, requestId: string) => Promise<Session>;
};

function store(env: Env): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } {
  return accountStore(env, STORE);
}

async function put<T>(env: Env, key: string, value: T, expiresAt: number): Promise<void> {
  const response = await store(env).fetch("https://account/mcp-oauth/put/" + encodeURIComponent(key), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, expiresAt }),
  });
  if (!response.ok) throw new Error("mcp_store_write_failed");
}

async function get<T>(env: Env, key: string, consume = false): Promise<T | null> {
  const response = await store(env).fetch(`https://account/mcp-oauth/${consume ? "consume" : "get"}/${encodeURIComponent(key)}`, { method: consume ? "POST" : "GET" });
  if (!response.ok) return null;
  return (await response.json() as Stored<T>).value;
}

export async function isMcpTokenActive(env: Env, session: Session): Promise<boolean> {
  if (session.tokenType !== "mcp" || !session.tokenId) return false;
  const value = await get<{ login: string }>(env, `token:${session.tokenId}`);
  return value?.login.toLowerCase() === session.login.toLowerCase();
}

async function revokeMcpToken(env: Env, tokenId: string): Promise<void> {
  await store(env).fetch(`https://account/mcp-oauth/delete/${encodeURIComponent(`token:${tokenId}`)}`, { method: "DELETE" });
}

function urlFor(env: Env, path: string): string { return new URL(path, env.PUBLIC_ORIGIN).toString(); }

function githubAuthorizationUrl(env: Env, state: string): string {
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  target.searchParams.set("redirect_uri", urlFor(env, "/api/auth/github/callback"));
  target.searchParams.set("state", state);
  return target.toString();
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function html(body: string, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set("Content-Type", "text/html; charset=utf-8");
  result.set("Cache-Control", "no-store");
  result.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect PKMS</title><body style="font:16px system-ui;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#202124"><main>${body}</main></body></html>`, { headers: result });
}

async function oauthError(request: Request, env: Env, error: string, state?: string): Promise<Response> {
  const redirectUri = new URL(request.url).searchParams.get("redirect_uri");
  if (!redirectUri || !safeRedirectUri(redirectUri)) return json({ error }, { status: 400 });
  const clientId = new URL(request.url).searchParams.get("client_id") ?? "";
  const client = await get<OAuthClient>(env, `client:${clientId}`);
  if (!client?.redirectUris.includes(redirectUri)) return json({ error }, { status: 400 });
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  if (state) target.searchParams.set("state", state);
  target.searchParams.set("iss", env.PUBLIC_ORIGIN);
  return Response.redirect(target.toString(), 302);
}

function safeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}

function validAgentPath(value: string, allowRoot = false): boolean {
  return (allowRoot && value === "") || (value.length > 0 && value.length <= 1024 && !value.startsWith("/") && !value.includes("\\") &&
    value.split("/").every((part) => part && part !== "." && part !== ".." && ![...part].some((character) => character.charCodeAt(0) < 32)));
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function challenge(verifier: string): Promise<string> {
  return encodeBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

async function callApi(request: Request, env: Env, requestId: string, dependencies: Dependencies): Promise<Response> {
  const bearer = request.headers.get("Authorization") ?? "";
  const apiRequest = new Request(new URL(request.url), {
    method: request.method,
    headers: { Authorization: bearer, ...(request.headers.get("Content-Type") ? { "Content-Type": request.headers.get("Content-Type")! } : {}) },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });
  return dependencies.dispatchApi(apiRequest, env, requestId);
}

async function resolveFile(
  env: Env, request: Request, requestId: string, dependencies: Dependencies,
  workspaceId: string, path: string,
): Promise<{ id: string; path: string; kind: string; revision: number } | null> {
  const parts = path.split("/");
  const parent = parts.slice(0, -1).join("/");
  const directoryUrl = new URL(urlFor(env, `/api/workspaces/${encodeURIComponent(workspaceId)}/directory`));
  if (parent) directoryUrl.searchParams.set("path", parent);
  const snapshot = await callApi(new Request(directoryUrl, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
  if (!snapshot.ok) return null;
  const body = await snapshot.json() as { files?: Array<{ id: string; path: string; kind: string; revision: number }> };
  return body.files?.find((file) => file.path === path) ?? null;
}

function toolResult(value: unknown): Record<string, unknown> {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], structuredContent: typeof value === "object" && value !== null ? value : { value } };
}

function toolError(message: string): Record<string, unknown> {
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function invokeTool(
  name: string, args: Record<string, unknown>, request: Request, env: Env, requestId: string, dependencies: Dependencies,
): Promise<Record<string, unknown>> {
  const base = env.PUBLIC_ORIGIN;
  if (name === "list_workspaces") {
    const response = await callApi(new Request(`${base}/api/workspaces`, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
    if (!response.ok) return toolError("Could not list PKMS workspaces.");
    const result = await response.json() as { workspaces?: unknown[] };
    return toolResult({ workspaces: result.workspaces ?? [] });
  }
  if (name === "list_files") {
    const workspaceId = String(args.workspaceId ?? "");
    const path = String(args.path ?? "");
    if (!/^[a-f0-9]{32}$/.test(workspaceId) || !validAgentPath(path, true)) return toolError("Invalid workspace or path.");
    const target = new URL(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/directory`);
    if (path) target.searchParams.set("path", path);
    const response = await callApi(new Request(target, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
    if (!response.ok) return toolError("Could not list this directory.");
    const result = await response.json() as { files?: Array<{ id: string; path: string; kind: string; size?: number }> };
    return toolResult({ files: result.files ?? [] });
  }
  if (name === "read_file") {
    const workspaceId = String(args.workspaceId ?? "");
    const path = String(args.path ?? "");
    if (!/^[a-f0-9]{32}$/.test(workspaceId) || !validAgentPath(path)) return toolError("Invalid workspace or path.");
    const file = await resolveFile(env, request, requestId, dependencies, workspaceId, path);
    if (!file || file.kind !== "markdown") return toolError("Markdown file not found.");
    const response = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
    if (!response.ok) return toolError("Could not read the Markdown file.");
    const data = await response.json() as { update: string; revision?: number };
    const Y = await import("yjs");
    const doc = new Y.Doc({ guid: file.id });
    Y.applyUpdate(doc, decodeBase64(data.update));
    return toolResult({ path, content: doc.getText("markdown").toString(), revision: data.revision ?? file.revision });
  }
  if (name === "write_file") {
    if (!args || typeof args.workspaceId !== "string" || typeof args.path !== "string" || typeof args.content !== "string") return toolError("workspaceId, path, and content are required.");
    const workspaceId = args.workspaceId;
    const path = args.path;
    const content = args.content;
    if (!/^[a-f0-9]{32}$/.test(workspaceId) || !validAgentPath(path) || encoder.encode(content).byteLength > 512 * 1024) return toolError("Invalid workspace, path, or Markdown size (maximum 512 KiB).");
    const file = await resolveFile(env, request, requestId, dependencies, workspaceId, path);
    if (!file) {
      const response = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/operations`, {
        method: "POST", headers: { Authorization: request.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID(), baseRevision: 0, clientId: "codex-mcp", operation: { type: "create-file", path, content } }),
      }), env, requestId, dependencies);
      if (!response.ok) return toolError("Could not create the Markdown file.");
      return toolResult(await response.json());
    }
    if (file.kind !== "markdown") return toolError("This path is not a Markdown file.");
    const current = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
    if (!current.ok) return toolError("Could not prepare the Markdown update.");
    const currentData = await current.json() as { update: string };
    const Y = await import("yjs");
    const doc = new Y.Doc({ guid: file.id });
    Y.applyUpdate(doc, decodeBase64(currentData.update));
    const baseStateVector = Y.encodeStateVector(doc);
    const text = doc.getText("markdown");
    const previous = text.toString();
    if (previous === content) return toolResult({ path, revision: file.revision, unchanged: true });
    if (previous !== content) {
      let prefix = 0;
      while (prefix < previous.length && prefix < content.length && previous.charCodeAt(prefix) === content.charCodeAt(prefix)) prefix++;
      let suffix = 0;
      while (suffix < previous.length - prefix && suffix < content.length - prefix && previous.charCodeAt(previous.length - suffix - 1) === content.charCodeAt(content.length - suffix - 1)) suffix++;
      doc.transact(() => {
        const removed = previous.length - prefix - suffix;
        if (removed) text.delete(prefix, removed);
        const inserted = content.slice(prefix, content.length - suffix);
        if (inserted) text.insert(prefix, inserted);
      }, "codex-mcp");
    }
    const update = encodeBase64(Y.encodeStateAsUpdate(doc, baseStateVector));
    const response = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, {
      method: "POST", headers: { Authorization: request.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: crypto.randomUUID(), fileId: file.id, update }),
    }), env, requestId, dependencies);
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { code?: string; message?: string };
      console.error("mcp_write_file_failed", { requestId, status: response.status, code: failure.code ?? "unknown", detail: failure.message ?? "unknown" });
      return toolError(`Could not save the Markdown file through PKMS (HTTP ${response.status}, ${failure.code ?? "unknown"}: ${failure.message ?? "unknown"}, request ${requestId}).`);
    }
    return toolResult({ path, ...(await response.json() as Record<string, unknown>) });
  }
  if (name === "sync_status") {
    const workspaceId = String(args.workspaceId ?? "");
    if (!/^[a-f0-9]{32}$/.test(workspaceId)) return toolError("Invalid workspaceId.");
    const response = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/sync-status`, { headers: { Authorization: request.headers.get("Authorization") ?? "" } }), env, requestId, dependencies);
    if (!response.ok) return toolError("Could not read sync status.");
    return toolResult(await response.json());
  }
  if (name === "flush_now") {
    const workspaceId = String(args.workspaceId ?? "");
    if (!/^[a-f0-9]{32}$/.test(workspaceId)) return toolError("Invalid workspaceId.");
    const response = await callApi(new Request(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/flush`, {
      method: "POST", headers: { Authorization: request.headers.get("Authorization") ?? "" },
    }), env, requestId, dependencies);
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { message?: string };
      return toolError(failure.message ?? "Could not start the GitHub backup.");
    }
    return toolResult(await response.json());
  }
  return toolError("Unknown PKMS tool.");
}

async function mcpPost(request: Request, env: Env, requestId: string, dependencies: Dependencies): Promise<Response> {
  const bearer = request.headers.get("Authorization");
  if (!bearer?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${urlFor(env, "/.well-known/oauth-protected-resource")}"` } });
  }
  const authenticated = await verifySession(env, bearer.slice("Bearer ".length));
  if (!authenticated || authenticated.tokenType !== "mcp" || authenticated.audience !== urlFor(env, "/mcp") || authenticated.login.toLowerCase() !== "lkh0310kr" || !await isMcpTokenActive(env, authenticated)) return json({ error: "invalid_token" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${urlFor(env, "/.well-known/oauth-protected-resource")}"` } });

  let message: Record<string, unknown>;
  try { message = await request.json() as Record<string, unknown>; }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const id = message.id;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid Request" } }, { status: 400 });
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return new Response(null, { status: 202 });
  let result: Record<string, unknown>;
  if (message.method === "initialize") {
    const params = message.params as { protocolVersion?: string } | undefined;
    const negotiatedVersion = params?.protocolVersion && SUPPORTED_PROTOCOLS.has(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSION;
    result = {
      protocolVersion: negotiatedVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pkms-cloud", version: "1.0.0" },
      instructions: "PKMS is a GitHub-backed Markdown workspace. List file metadata first, read only the files needed, and route all edits through PKMS tools. Never infer unseen file contents.",
    };
  } else if (message.method === "ping") {
    result = {};
  } else if (message.method === "tools/list") {
    result = { tools: [
      { name: "list_workspaces", description: "List connected PKMS workspaces. Returns repository names and sync metadata only.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
      { name: "list_files", description: "List immediate file and folder entries in a workspace directory. Does not return file contents.", inputSchema: { type: "object", properties: { workspaceId: { type: "string" }, path: { type: "string", description: "Directory path relative to the repository root; omit for root." } }, required: ["workspaceId"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
      { name: "read_file", description: "Read one Markdown file by its repository-relative path.", inputSchema: { type: "object", properties: { workspaceId: { type: "string" }, path: { type: "string" } }, required: ["workspaceId", "path"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
      { name: "write_file", description: "Create or update one Markdown file through the PKMS collaboration protocol. This changes the workspace and will be backed up to GitHub.", inputSchema: { type: "object", properties: { workspaceId: { type: "string" }, path: { type: "string" }, content: { type: "string" } }, required: ["workspaceId", "path", "content"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
      { name: "sync_status", description: "Read server revision and GitHub backup state for one workspace.", inputSchema: { type: "object", properties: { workspaceId: { type: "string" } }, required: ["workspaceId"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
      { name: "flush_now", description: "Retry the pending GitHub backup for a workspace and return sync metadata.", inputSchema: { type: "object", properties: { workspaceId: { type: "string" } }, required: ["workspaceId"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
    ] };
  } else if (message.method === "tools/call") {
    const params = message.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if ((params?.name === "write_file" || params?.name === "flush_now") && !authenticated.scopes?.includes("pkms:write")) result = toolError("This MCP token has read-only access. Reconnect and approve the pkms:write permission to make changes.");
    else if (params?.name && !authenticated.scopes?.includes("pkms:read")) result = toolError("This MCP token does not have pkms:read permission.");
    else if (!params?.name) result = toolError("Tool name is required.");
    else result = await invokeTool(params.name, params.arguments ?? {}, request, env, requestId, dependencies);
  } else {
    return json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: "Method not found" } }, { status: 200 });
  }
  if (id === undefined) return new Response(null, { status: 202 });
  return json({ jsonrpc: "2.0", id, result });
}

async function oauthRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return json({ resource: urlFor(env, "/mcp"), authorization_servers: [env.PUBLIC_ORIGIN], bearer_methods_supported: ["header"], scopes_supported: [...SCOPES] });
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return json({
      issuer: env.PUBLIC_ORIGIN,
      authorization_endpoint: urlFor(env, "/oauth/authorize"),
      token_endpoint: urlFor(env, "/oauth/token"),
      registration_endpoint: urlFor(env, "/oauth/register"),
      revocation_endpoint: urlFor(env, "/oauth/revoke"),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...SCOPES],
      authorization_response_iss_parameter_supported: true,
    });
  }
  if (url.pathname === "/oauth/register" && request.method === "POST") {
    let body: { client_name?: string; redirect_uris?: string[] };
    try { body = await request.json() as typeof body; } catch { return json({ error: "invalid_client_metadata" }, { status: 400 }); }
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((item): item is string => typeof item === "string" && safeRedirectUri(item)) : [];
    if (!redirectUris.length || redirectUris.length !== body.redirect_uris?.length || redirectUris.length > 20) return json({ error: "invalid_redirect_uri" }, { status: 400 });
    const clientId = randomToken(24);
    const client: OAuthClient = { clientId, clientName: String(body.client_name ?? "MCP client").slice(0, 120), redirectUris };
    try { await put(env, `client:${clientId}`, client, Date.now() + 365 * 24 * 60 * 60 * 1000); }
    catch { return json({ error: "client_registration_limit_reached" }, { status: 429 }); }
    return json({ client_id: clientId, client_name: client.clientName, redirect_uris: redirectUris, grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }, { status: 201 });
  }
  if (url.pathname === "/oauth/authorize" && request.method === "GET") {
    const clientId = url.searchParams.get("client_id") ?? "";
    const client = await get<OAuthClient>(env, `client:${clientId}`);
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge") ?? "";
    const requestedResource = url.searchParams.get("resource");
    if (!client || !client.redirectUris.includes(redirectUri) || url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || !state || (requestedResource && requestedResource !== urlFor(env, "/mcp"))) return oauthError(request, env, "invalid_request", state);
    const scopes = (url.searchParams.get("scope") ?? "pkms:read pkms:write").split(/\s+/).filter(Boolean);
    if (scopes.some((scope) => !SCOPES.has(scope)) || !scopes.includes("pkms:read")) return oauthError(request, env, "invalid_scope", state);
    const nonce = randomToken(24);
    await put<AuthorizeRequest>(env, `request:${nonce}`, { kind: "authorize", clientId, redirectUri, clientState: state, challenge: codeChallenge, scope: scopes, loginNonce: nonce }, Date.now() + 10 * 60 * 1000);
    return html(`<h1>Connect PKMS</h1><p><strong>${htmlEscape(client.clientName)}</strong> requests access to your PKMS workspace.</p><p>Permissions: ${htmlEscape(scopes.join(", "))}</p><p>File contents you choose to read may be sent to the AI service connected to this MCP client.</p><form method="post" action="${htmlEscape(urlFor(env, "/oauth/authorize"))}"><input type="hidden" name="nonce" value="${nonce}"><button name="approve" value="yes">Continue with GitHub</button><button name="approve" value="no">Cancel</button></form>`);
  }
  if (url.pathname === "/oauth/authorize" && request.method === "POST") {
    if (request.headers.get("Origin") !== new URL(env.PUBLIC_ORIGIN).origin) return json({ error: "origin_mismatch" }, { status: 403 });
    const form = await request.formData();
    const nonce = String(form.get("nonce") ?? "");
    // The nonce is high entropy, stored server-side, and only accepted for same-origin
    // form submissions. Avoid a single shared cookie: parallel OAuth tabs overwrite it.
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(nonce)) {
      console.warn("mcp_oauth_authorize_rejected", { reason: "nonce_invalid" });
      return json({ error: "invalid_authorization_request" }, { status: 400 });
    }
    const transaction = await get<AuthorizeRequest>(env, `request:${nonce}`);
    if (!transaction || transaction.kind !== "authorize") {
      const started = await get<StartedAuthorize>(env, `started:${nonce}`);
      if (started?.kind === "started") {
        console.info("mcp_oauth_authorize_replayed");
        return new Response(null, { status: 303, headers: { Location: githubAuthorizationUrl(env, started.githubState), "Cache-Control": "no-store" } });
      }
      console.warn("mcp_oauth_authorize_rejected", { reason: "transaction_missing" });
      return html("<h1>Sign-in expired</h1><p>Return to Codex and start a new PKMS sign-in.</p>");
    }
    const clientId = transaction.clientId;
    const redirectUri = transaction.redirectUri;
    const state = transaction.clientState;
    const scope = transaction.scope;
    const client = await get<OAuthClient>(env, `client:${clientId}`);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      console.warn("mcp_oauth_authorize_rejected", { reason: "client_or_redirect_invalid" });
      return json({ error: "invalid_authorization_request" }, { status: 400 });
    }
    if (form.get("approve") !== "yes") {
      const cancelUrl = new URL(urlFor(env, "/oauth/authorize"));
      cancelUrl.searchParams.set("redirect_uri", redirectUri);
      cancelUrl.searchParams.set("client_id", clientId);
      return oauthError(new Request(cancelUrl), env, "access_denied", state);
    }
    const consumed = await get<AuthorizeRequest>(env, `request:${nonce}`, true);
    if (!consumed || consumed.clientId !== transaction.clientId || consumed.clientState !== transaction.clientState) {
      console.warn("mcp_oauth_authorize_rejected", { reason: "transaction_consume_conflict" });
      return json({ error: "invalid_authorization_request" }, { status: 400 });
    }
    const githubState = randomToken(24);
    await put(env, `github:${githubState}`, transaction, Date.now() + 10 * 60 * 1000);
    await put<StartedAuthorize>(env, `started:${nonce}`, { kind: "started", githubState }, Date.now() + 10 * 60 * 1000);
    return new Response(null, { status: 303, headers: { Location: githubAuthorizationUrl(env, githubState), "Cache-Control": "no-store", "Set-Cookie": `__Host-pkms_oauth=${githubState}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  if (url.pathname === "/oauth/token" && request.method === "POST") {
    const form = await request.formData();
    const grantType = String(form.get("grant_type") ?? "");
    if (grantType !== "authorization_code") return json({ error: "unsupported_grant_type" }, { status: 400 });
    const code = String(form.get("code") ?? "");
    const clientId = String(form.get("client_id") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const verifier = String(form.get("code_verifier") ?? "");
    const record = await get<AuthorizationCode>(env, `code:${code}`, true);
    if (!record || record.kind !== "code" || record.clientId !== clientId || record.redirectUri !== redirectUri || verifier.length < 43 || verifier.length > 128 || await challenge(verifier) !== record.challenge) return json({ error: "invalid_grant" }, { status: 400 });
    const tokenId = randomToken(24);
    await put(env, `token:${tokenId}`, { login: record.login }, Date.now() + TOKEN_LIFETIME);
    const token = await signSession(env, { login: record.login, avatarUrl: record.avatarUrl, expiresAt: Date.now() + TOKEN_LIFETIME, scopes: record.scope, tokenType: "mcp", audience: urlFor(env, "/mcp"), tokenId });
    return json({ access_token: token, token_type: "Bearer", expires_in: TOKEN_LIFETIME / 1000, scope: record.scope.join(" ") });
  }
  if (url.pathname === "/oauth/revoke" && request.method === "POST") {
    const form = await request.formData();
    const session = await verifySession(env, String(form.get("token") ?? ""));
    if (session?.tokenType === "mcp" && session.tokenId) await revokeMcpToken(env, session.tokenId);
    return json({});
  }
  return null;
}

export async function handleMcpGithubCallback(
  request: Request, env: Env, requestId: string,
  saveGitHubGrant: Dependencies["saveGitHubGrant"],
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/github/callback" || request.method !== "GET") return null;
  const githubState = url.searchParams.get("state") ?? "";
  const transaction = await get<AuthorizeRequest>(env, `github:${githubState}`, true);
  if (!transaction || transaction.kind !== "authorize") return null;
  const redirectError = (error: string) => {
    const target = new URL(transaction.redirectUri);
    target.searchParams.set("error", error);
    target.searchParams.set("state", transaction.clientState);
    target.searchParams.set("iss", env.PUBLIC_ORIGIN);
    return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": "__Host-pkms_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } });
  };
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (oauthError || !code || !githubState || cookie(request, "__Host-pkms_oauth") !== githubState) return redirectError(oauthError === "access_denied" ? "access_denied" : "invalid_grant");
  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  if (!exchange.ok) return redirectError("server_error");
  const grant = await exchange.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!grant.access_token) return redirectError("invalid_grant");
  let session: Session;
  try { session = await saveGitHubGrant(env, grant, requestId); }
  catch { return redirectError("access_denied"); }
  const authCode = randomToken(32);
  await put<AuthorizationCode>(env, `code:${authCode}`, {
    kind: "code", clientId: transaction.clientId, redirectUri: transaction.redirectUri,
    challenge: transaction.challenge, scope: transaction.scope, login: session.login, avatarUrl: session.avatarUrl,
  }, Date.now() + AUTH_CODE_LIFETIME);
  const target = new URL(transaction.redirectUri);
  target.searchParams.set("code", authCode);
  target.searchParams.set("state", transaction.clientState);
  target.searchParams.set("iss", env.PUBLIC_ORIGIN);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", "__Host-pkms_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  headers.set("Location", target.toString());
  return new Response(null, { status: 302, headers });
}

export async function handleMcpRequest(
  request: Request, env: Env, requestId: string, dependencies: Dependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/.well-known/") || url.pathname.startsWith("/oauth/")) return oauthRoute(request, env);
  if (url.pathname !== "/mcp") return null;
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  return mcpPost(request, env, requestId, dependencies);
}
