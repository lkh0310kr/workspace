import { createRequestHandler } from "react-router";
import type { Env, Session } from "./env";
import { accountStore } from "./SupabaseAccountStore";
import { cookie, decryptSecret, encryptSecret, json, verifySession } from "./crypto";
import { handleMcpGithubCallback, handleMcpRequest, isMcpTokenActive } from "./mcp";
import { flushDueWorkspaces } from "./SupabaseVault";
import { openIdConfiguration, publicJwks } from "./realtimeAuth";
import { handleWorkspaceApi } from "./workspaceApi";
import { handleAuthRoute, authFailure, sameOrigin } from "./authRoutes";


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


async function api(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, protocolVersion: 1 });
  const authRoute = await handleAuthRoute(request, env, requestId, trace, saveGitHubGrant);
  if (authRoute) return authRoute;
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
