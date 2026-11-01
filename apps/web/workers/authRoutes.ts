import type { Env, Session } from "./env";
import { cookie, json, randomToken, sessionCookie, signSession, verifySessionDetailed } from "./crypto";

type Trace = (requestId: string, event: string, fields?: Record<string, string | number | boolean | undefined>) => void;
type GitHubGrant = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
type SaveGitHubGrant = (env: Env, grant: GitHubGrant, requestId: string) => Promise<Session>;
const ALLOWED_GITHUB_LOGIN = "lkh0310kr";

export function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === env.PUBLIC_ORIGIN;
}

export function authFailure(requestId: string, code: string, status: number): Response {
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

export async function handleAuthRoute(request: Request, env: Env, requestId: string, trace: Trace, saveGitHubGrant: SaveGitHubGrant): Promise<Response | null> {
  const url = new URL(request.url);
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
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "github_credentials_store_failed";
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
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "github_credentials_store_failed";
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

  return null;
}
