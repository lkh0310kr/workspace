import { createRequestHandler } from "react-router";
import type { Env, Session } from "./env";
import { accountStore } from "./SupabaseAccountStore";
import { cookie, decryptSecret, encryptSecret, json, randomToken, sessionCookie, signSession, verifySession, verifySessionDetailed } from "./crypto";
import { handleMcpGithubCallback, handleMcpRequest, isMcpTokenActive } from "./mcp";
import { flushDueWorkspaces } from "./SupabaseVault";
import { openIdConfiguration, publicJwks } from "./realtimeAuth";
import { handleWorkspaceApi } from "./workspaceApi";


const ALLOWED_GITHUB_LOGIN = "lkh0310kr";


interface GitHubGrant {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

function trace(requestId: string, event: string, fields: Record<string, string | number | boolean | undefined> = {}): void {
  const level = event.endsWith(".failed") ? "error" : event.endsWith(".rejected") ? "warn" : "info";
  const entry = JSON.stringify({ time: new Date().toISOString(), level, requestId, event, ...fields });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

class AuthFlowError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function saveGitHubGrant(env: Env, grant: GitHubGrant, requestId: string): Promise<Session> {
  if (!grant.access_token) throw new AuthFlowError("github_token_missing");
  trace(requestId, "auth.github.user_lookup.started");
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${grant.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "PKMS-Cloud/1.0" },
  });
  if (!userResponse.ok) {
    trace(requestId, "auth.github.user_lookup.failed", { status: userResponse.status });
    throw new AuthFlowError("github_user_lookup_failed");
  }
  const user = await userResponse.json() as { login: string; avatar_url?: string };
  trace(requestId, "auth.github.user_lookup.succeeded", { login: user.login });
  if (user.login.toLowerCase() !== ALLOWED_GITHUB_LOGIN) {
    trace(requestId, "auth.github.user_lookup.rejected", { reason: "account_not_allowed", login: user.login });
    throw new AuthFlowError("github_account_not_allowed");
  }
  const stored: Record<string, unknown> = {
    accessToken: await encryptSecret(env, grant.access_token),
    user: { login: user.login, avatarUrl: user.avatar_url },
  };
  if (grant.refresh_token) stored.refreshToken = await encryptSecret(env, grant.refresh_token);
  if (grant.expires_in) stored.expiresAt = Date.now() + grant.expires_in * 1000;
  const storedResponse = await account(env, user.login).fetch("https://account/credentials", { method: "PUT", body: JSON.stringify(stored) });
  if (!storedResponse.ok) {
    trace(requestId, "auth.github.credentials_store.failed", { status: storedResponse.status, login: user.login });
    throw new AuthFlowError("github_credentials_store_failed");
  }
  trace(requestId, "auth.github.credentials_store.succeeded", { login: user.login });
  return { login: user.login, avatarUrl: user.avatar_url, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
}

function account(env: Env, login: string): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } {
  return accountStore(env, login);
}

async function requireSession(request: Request, env: Env, requestId: string): Promise<Session | Response> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = await verifySession(env, bearer ?? cookie(request, "__Host-pkms_session"));
  if (!session) {
    trace(requestId, "auth.session.rejected", { path: new URL(request.url).pathname });
    return json({ error: "unauthorized", requestId }, { status: 401 });
  }
  if (session.login.toLowerCase() !== ALLOWED_GITHUB_LOGIN) {
    trace(requestId, "auth.session.rejected", { path: new URL(request.url).pathname, reason: "account_not_allowed", login: session.login });
    return json({ error: "account_not_allowed", requestId }, { status: 403 });
  }
  if (session.tokenType === "mcp" && (session.audience !== `${env.PUBLIC_ORIGIN}/mcp` || !await isMcpTokenActive(env, session))) {
    trace(requestId, "auth.session.rejected", { path: new URL(request.url).pathname, reason: "mcp_token_invalid", login: session.login });
    return json({ error: "invalid_token", requestId }, { status: 401 });
  }
  return session;
}

function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === env.PUBLIC_ORIGIN;
}

function authFailure(requestId: string, code: string, status: number): Response {
  const location = new URL("/", "https://pkms.invalid");
  location.searchParams.set("auth_error", code);
  location.searchParams.set("request_id", requestId);
  return new Response(null, { status: 302, headers: {
    Location: `${location.pathname}${location.search}`,
    "Set-Cookie": "__Host-pkms_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "Cache-Control": "no-store",
    "X-PKMS-Auth-Status": String(status),
  } });
}

async function api(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, protocolVersion: 1 });
  if (request.method === "GET" && url.pathname === "/api/auth/github") {
    trace(requestId, "auth.github.start");
    const state = randomToken(24);
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    target.searchParams.set("redirect_uri", `${env.PUBLIC_ORIGIN}/api/auth/github/callback`);
    target.searchParams.set("state", state);
    return new Response(null, { status: 302, headers: {
      Location: target.toString(),
      "Set-Cookie": `__Host-pkms_oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store",
    } });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/github/callback") {
    const oauthError = url.searchParams.get("error");
    const state = url.searchParams.get("state");
    const expectedState = cookie(request, "__Host-pkms_oauth");
    const code = url.searchParams.get("code");
    if (oauthError) {
      const code = oauthError === "access_denied" ? "github_access_denied" : "github_authorization_failed";
      trace(requestId, "auth.github.callback.rejected", { reason: code });
      return authFailure(requestId, code, 403);
    }
    if (!state || !expectedState || state !== expectedState || !code) {
      const reason = !state ? "state_missing" : !expectedState ? "oauth_cookie_missing" : state !== expectedState ? "state_mismatch" : "code_missing";
      trace(requestId, "auth.github.callback.rejected", { reason });
      return authFailure(requestId, "invalid_oauth_state", 400);
    }
    trace(requestId, "auth.github.token_exchange.started");
    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
    });
    if (!exchange.ok) {
      trace(requestId, "auth.github.token_exchange.failed", { status: exchange.status });
      return authFailure(requestId, "github_token_exchange_failed", 502);
    }
    const grant = await exchange.json() as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; error?: string };
    if (!grant.access_token) {
      const error = grant.error === "bad_verification_code" ? "github_code_rejected" : "github_token_missing";
      trace(requestId, "auth.github.token_exchange.rejected", { reason: error });
      return authFailure(requestId, error, 502);
    }
    let session: Session;
    try { session = await saveGitHubGrant(env, grant, requestId); }
    catch (error) {
      const code = error instanceof AuthFlowError ? error.code : "github_credentials_store_failed";
      trace(requestId, "auth.github.callback.failed", { stage: code });
      return authFailure(requestId, code, 502);
    }
    let signed: string;
    try { signed = await signSession(env, session); }
    catch {
      trace(requestId, "auth.github.session_sign.failed", { login: session.login });
      return authFailure(requestId, "session_create_failed", 500);
    }
    trace(requestId, "auth.github.completed", { login: session.login });
    trace(requestId, "auth.github.session_cookie.issued", { login: session.login, maxAgeSeconds: 30 * 24 * 60 * 60 });
    return new Response(null, { status: 302, headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(signed, 30 * 24 * 60 * 60),
    } });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/device/start") {
    if (!sameOrigin(request, env)) {
      trace(requestId, "auth.device.start.rejected", { reason: "origin_mismatch" });
      return json({ error: "origin_mismatch", requestId }, { status: 403 });
    }
    trace(requestId, "auth.device.start");
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID }),
    });
    const device = await response.json() as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; error?: string };
    if (!response.ok || !device.device_code) {
      trace(requestId, "auth.device.start.failed", { status: response.status, reason: device.error ?? "device_flow_unavailable" });
      return json({ error: device.error ?? "device_flow_unavailable", requestId }, { status: 502 });
    }
    return json(device, { status: 200 });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/device/poll") {
    if (!sameOrigin(request, env)) {
      trace(requestId, "auth.device.poll.rejected", { reason: "origin_mismatch" });
      return json({ error: "origin_mismatch", requestId }, { status: 403 });
    }
    const body = await request.json() as { deviceCode?: string };
    if (!body.deviceCode || body.deviceCode.length > 2048) return json({ error: "invalid_device_code" }, { status: 400 });
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, device_code: body.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
    });
    const grant = await response.json() as GitHubGrant;
    if (grant.error === "authorization_pending" || grant.error === "slow_down") return json({ pending: true, interval: grant.error === "slow_down" ? 10 : undefined }, { status: 202 });
    if (!response.ok || !grant.access_token) {
      trace(requestId, "auth.device.poll.failed", { status: response.status, reason: grant.error ?? "device_authorization_failed" });
      return json({ error: grant.error ?? "device_authorization_failed", requestId }, { status: 400 });
    }
    let session: Session;
    try { session = await saveGitHubGrant(env, grant, requestId); }
    catch (error) {
      const code = error instanceof AuthFlowError ? error.code : "github_credentials_store_failed";
      trace(requestId, "auth.device.complete.failed", { stage: code });
      return json({ error: code, requestId }, { status: 502 });
    }
    const token = await signSession(env, session);
    return json({ pending: false, token, user: { login: session.login, avatarUrl: session.avatarUrl }, expiresAt: session.expiresAt });
  }
  if (request.method === "GET" && url.pathname === "/api/session") {
    const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const sessionCookieValue = cookie(request, "__Host-pkms_session");
    const validation = await verifySessionDetailed(env, bearer ?? sessionCookieValue);
    const session = validation.session;
    trace(requestId, "auth.session.checked", {
      bearerPresent: Boolean(bearer),
      cookiePresent: Boolean(sessionCookieValue),
      validation: validation.reason,
      accountAllowed: Boolean(session && session.login.toLowerCase() === ALLOWED_GITHUB_LOGIN),
    });
    const allowedSession = session?.login.toLowerCase() === ALLOWED_GITHUB_LOGIN ? session : null;
    return json({ user: allowedSession ? { login: allowedSession.login, avatarUrl: allowedSession.avatarUrl } : null });
  }
  if (request.method === "POST" && url.pathname === "/api/logout") {
    if (!sameOrigin(request, env)) return json({ error: "origin_mismatch" }, { status: 403 });
    return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
  }

  const auth = await requireSession(request, env, requestId);
  if (auth instanceof Response) return auth;
  if (auth.tokenType === "mcp") {
    const scope = request.method === "GET" || request.method === "HEAD" ? "pkms:read" : "pkms:write";
    if (!auth.scopes?.includes(scope)) return json({ error: "insufficient_scope", requiredScope: scope, requestId }, { status: 403, headers: { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"` } });
  }
  if (!sameOrigin(request, env)) return json({ error: "origin_mismatch" }, { status: 403 });
  return handleWorkspaceApi(request, env, requestId, auth);
}


const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(flushDueWorkspaces(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const startedAt = Date.now();
    let response: Response;
    try {
      if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") response = json(openIdConfiguration(env));
      else if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") response = json(publicJwks());
      else {
      const mcpResponse = await handleMcpRequest(request, env, requestId, {
        dispatchApi: (input, bindings, id) => api(input, bindings, id),
        saveGitHubGrant,
      });
      if (mcpResponse) response = mcpResponse;
      else {
        const mcpCallback = await handleMcpGithubCallback(request, env, requestId, saveGitHubGrant);
        if (mcpCallback) response = mcpCallback;
        else if (url.pathname.startsWith("/api/")) response = await api(request, env, requestId);
        else response = await requestHandler(request);
      }
      }
    } catch (error) {
      // Error messages can contain upstream response bodies or user content. Keep the
      // stack frames (which identify the failing code path) without logging messages.
      const errorFrames = error instanceof Error
        ? error.stack?.split("\n").slice(1, 5).map((frame) => frame.trim()).join(" | ")
        : undefined;
      trace(requestId, "request.failed", {
        method: request.method,
        path: url.pathname,
        errorType: error instanceof Error ? error.name : "UnknownError",
        errorFrames,
      });
      response = url.pathname === "/api/auth/github/callback"
        ? authFailure(requestId, "oauth_callback_internal_error", 500)
        : url.pathname === "/mcp" || url.pathname.startsWith("/oauth/")
          ? json({ error: "mcp_request_failed", requestId }, { status: 500 })
          : new Response("Internal Server Error", { status: 500 });
    }
    trace(requestId, "request.completed", { method: request.method, path: url.pathname, status: response.status, durationMs: Date.now() - startedAt });
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
