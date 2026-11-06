import type { Env, Session } from "./env";
import { decryptSecret, encryptSecret, json, randomToken } from "./crypto";
import { getAccountValue, putAccountValue, removeAccountValue } from "./SupabaseAccountStore";

type Provider = "cloudflare" | "supabase";
type SavedConnection = { accessToken: string; refreshToken?: string; expiresAt?: number; connectedAt: string };
type SupplementStatus = "available" | "not_configured" | "permission_required" | "provider_error" | "inactive" | "no_data";
type OAuthState = { provider: Provider; login: string; verifier: string; createdAt: number };
const redirectUri = (env: Env) => `${env.PUBLIC_ORIGIN}/api/services/oauth/callback`;

function providerFromPath(path: string): Provider | null {
  return path.includes("cloudflare") ? "cloudflare" : path.includes("supabase") ? "supabase" : null;
}

function clientId(env: Env, provider: Provider): string | undefined {
  return provider === "cloudflare" ? env.CLOUDFLARE_OAUTH_CLIENT_ID : env.SUPABASE_OAUTH_CLIENT_ID;
}

function clientSecret(env: Env, provider: Provider): string | undefined {
  return provider === "cloudflare" ? env.CLOUDFLARE_OAUTH_CLIENT_SECRET : env.SUPABASE_OAUTH_CLIENT_SECRET;
}

async function accessToken(env: Env, login: string, provider: Provider): Promise<string | null> {
  const key = `service:${provider}`;
  const sealed = await getAccountValue(env, login, key);
  if (typeof sealed !== "string") return null;
  const saved = JSON.parse(await decryptSecret(env, sealed)) as SavedConnection;
  if (!saved.expiresAt || saved.expiresAt > Date.now() + 60_000) return decryptSecret(env, saved.accessToken);
  if (!saved.refreshToken) return null;
  const credentials = await tokenRequest(env, provider, {
    grant_type: "refresh_token",
    refresh_token: await decryptSecret(env, saved.refreshToken),
  });
  if (!credentials.access_token) return null;
  const refreshed: SavedConnection = {
    accessToken: await encryptSecret(env, credentials.access_token),
    ...(credentials.refresh_token ? { refreshToken: await encryptSecret(env, credentials.refresh_token) } : saved.refreshToken ? { refreshToken: saved.refreshToken } : {}),
    ...(credentials.expires_in ? { expiresAt: Date.now() + credentials.expires_in * 1000 } : {}),
    connectedAt: saved.connectedAt,
  };
  await putAccountValue(env, login, key, await encryptSecret(env, JSON.stringify(refreshed)));
  return credentials.access_token;
}

async function revokeConnection(env: Env, login: string, provider: Provider): Promise<void> {
  const key = `service:${provider}`;
  try {
    const sealed = await getAccountValue(env, login, key);
    if (typeof sealed === "string") {
      const saved = JSON.parse(await decryptSecret(env, sealed)) as SavedConnection;
      const token = saved.refreshToken ? await decryptSecret(env, saved.refreshToken) : await decryptSecret(env, saved.accessToken);
      const id = clientId(env, provider);
      const secret = clientSecret(env, provider);
      const body = new URLSearchParams({ token, token_type_hint: saved.refreshToken ? "refresh_token" : "access_token" });
      if (id) body.set("client_id", id);
      if (secret) body.set("client_secret", secret);
      const endpoint = provider === "cloudflare" ? "https://dash.cloudflare.com/oauth2/revoke" : "https://api.supabase.com/v1/oauth/revoke";
      await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
    }
  } catch { /* local credential deletion still disconnects the account */ }
  await removeAccountValue(env, login, key);
}

type TokenGrant = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function tokenRequest(env: Env, provider: Provider, fields: Record<string, string>): Promise<TokenGrant> {
  const id = clientId(env, provider);
  if (!id) throw new Error(`${provider}_oauth_not_configured`);
  const secret = clientSecret(env, provider);
  const endpoint = provider === "cloudflare" ? "https://dash.cloudflare.com/oauth2/token" : "https://api.supabase.com/v1/oauth/token";
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
  const body = new URLSearchParams(fields);
  if (secret) headers.set("Authorization", `Basic ${btoa(`${id}:${secret}`)}`);
  else body.set("client_id", id);
  const response = await fetch(endpoint, { method: "POST", headers, body });
  const result = await response.json() as TokenGrant;
  if (!response.ok || !result.access_token) throw new Error(`${provider}_token_exchange_failed`);
  return result;
}

function beginOAuth(env: Env, provider: Provider, login: string): Promise<Response> {
  return beginOAuthInner(env, provider, login);
}

async function beginOAuthInner(env: Env, provider: Provider, login: string): Promise<Response> {
  const id = clientId(env, provider);
  if (!id) return json({ error: "oauth_not_configured", provider }, { status: 503 });
  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  await putAccountValue(env, login, `service-oauth:${state}`, await encryptSecret(env, JSON.stringify({ provider, login, verifier, createdAt: Date.now() } satisfies OAuthState)));
  const authorize = new URL(provider === "cloudflare" ? "https://dash.cloudflare.com/oauth2/auth" : "https://api.supabase.com/v1/oauth/authorize");
  authorize.searchParams.set("client_id", id);
  authorize.searchParams.set("redirect_uri", redirectUri(env));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  if (provider === "supabase") authorize.searchParams.set("scope", "projects:read analytics:read");
  if (provider === "cloudflare") {
    const scopes = env.CLOUDFLARE_OAUTH_SCOPES ?? "account-analytics.read account-settings.read workers-scripts.metadata_read";
    authorize.searchParams.set("scope", scopes);
  }
  return json({ url: authorize.toString() });
}

export async function handleServiceOAuthCallback(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/services/oauth/callback") return null;
  const state = url.searchParams.get("state") ?? "";
  // Provider is carried in the stored state, so find it using the supplied random state.
  let record: OAuthState | null = null;
  const value = await getAccountValue(env, "lkh0310kr", `service-oauth:${state}`);
  try { if (typeof value === "string") record = JSON.parse(await decryptSecret(env, value)) as OAuthState; } catch { /* invalid state */ }
  if (record) await removeAccountValue(env, record.login, `service-oauth:${state}`);
  if (!record || record.login !== "lkh0310kr" || Date.now() - record.createdAt > 10 * 60_000) return callbackPage(false, "연결 요청이 만료되었거나 올바르지 않습니다.");
  if (url.searchParams.has("error")) return callbackPage(false, "공급자 로그인이 취소되었거나 거부되었습니다.");
  const code = url.searchParams.get("code");
  if (!code) return callbackPage(false, "인증 코드를 받지 못했습니다.");
  try {
    const grant = await tokenRequest(env, record.provider, {
      grant_type: "authorization_code", code, redirect_uri: redirectUri(env), code_verifier: record.verifier,
    });
    const saved: SavedConnection = {
      accessToken: await encryptSecret(env, grant.access_token!),
      ...(grant.refresh_token ? { refreshToken: await encryptSecret(env, grant.refresh_token) } : {}),
      ...(grant.expires_in ? { expiresAt: Date.now() + grant.expires_in * 1000 } : {}),
      connectedAt: new Date().toISOString(),
    };
    await putAccountValue(env, record.login, `service:${record.provider}`, await encryptSecret(env, JSON.stringify(saved)));
    return callbackPage(true, `${record.provider === "cloudflare" ? "Cloudflare" : "Supabase"} 연결이 완료되었습니다. 앱으로 돌아가 상태를 새로고침하세요.`);
  } catch {
    return callbackPage(false, "공급자 연결을 완료하지 못했습니다. 설정과 권한을 확인한 뒤 다시 시도하세요.");
  }
}

function callbackPage(ok: boolean, message: string): Response {
  const color = ok ? "#2f9b68" : "#c55b4a";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>서비스 연결</title><main><h1>${ok ? "연결 완료" : "연결 실패"}</h1><p>${message}</p><small>이 창을 닫아도 안전합니다.</small></main><style>body{margin:0;background:#111;color:#eee;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:440px;padding:36px;border:1px solid #333;border-radius:16px}h1{color:${color}}p{line-height:1.6;color:#ccc}</style>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
}

async function cloudflareSummary(token: string): Promise<unknown> {
  const accountsResponse = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", { headers: { Authorization: `Bearer ${token}` } });
  if (!accountsResponse.ok) throw new Error("cloudflare_accounts_failed");
  const accountsBody = await accountsResponse.json() as { result?: Array<{ id: string; name: string }> };
  const accounts = await Promise.all((accountsBody.result ?? []).map(async (account) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account.id)}/workers/scripts`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return { id: account.id, name: account.name, error: "workers_unavailable", workers: [] };
    const body = await response.json() as { result?: Array<{ id: string; created_on?: string; modified_on?: string; usage_model?: string }> };
    const workers = (body.result ?? []).slice(0, 50).map((worker) => ({ name: worker.id, lastModified: worker.modified_on ?? worker.created_on ?? null, usageModel: worker.usage_model ?? null }));
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60_000);
    const query = `query WorkerDaily($accountTag: string, $start: string, $end: string) { viewer { accounts(filter: { accountTag: $accountTag }) { workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end }) { sum { requests errors subrequests } } } } }`;
    const analyticsResponse = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables: { accountTag: account.id, start: start.toISOString(), end: end.toISOString() } }) });
    let analytics24h: { requests: number; errors: number; subrequests: number } | null = null;
    if (analyticsResponse.ok) {
      const data = await analyticsResponse.json() as { data?: { viewer?: { accounts?: Array<{ workersInvocationsAdaptive?: Array<{ sum?: { requests?: number; errors?: number; subrequests?: number } }> }> } } };
      const sums = data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
      analytics24h = sums.reduce((total, point) => ({ requests: total.requests + (point.sum?.requests ?? 0), errors: total.errors + (point.sum?.errors ?? 0), subrequests: total.subrequests + (point.sum?.subrequests ?? 0) }), { requests: 0, errors: 0, subrequests: 0 });
    }
    return { id: account.id, name: account.name, workers, analytics24h };
  }));
  return { provider: "cloudflare", connected: true, accounts };
}

async function supabaseSummary(token: string, metricsToken: string | null): Promise<unknown> {
  const response = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error("supabase_projects_failed");
  const projects = await response.json() as Array<{ id: string; name: string; status?: string; region?: string; organization_id?: string }>;
  const result = await Promise.all(projects.slice(0, 10).map(async (project) => {
    let databaseSizeMb: number | null = null;
    let activeConnections: number | null = null;
    let storageRequests: number | null = null;
    let apiRequests: number | null = null;
    let diskUsedBytes: number | null = null;
    let metricsError: string | null = null;
    let usageStatus: SupplementStatus = metricsToken ? "provider_error" : "not_configured";
    let diskStatus: SupplementStatus = metricsToken ? "provider_error" : "not_configured";
    const active = project.status === "ACTIVE_HEALTHY" || project.status === "ACTIVE_UNHEALTHY";
    if (!active) {
      usageStatus = "inactive";
      diskStatus = "inactive";
    }
    try {
      const metricsResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/analytics/endpoints/metrics`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/plain" } });
      if (metricsResponse.ok) {
        const text = await metricsResponse.text();
        const lines = text.split("\n").filter((line) => line && !line.startsWith("#"));
        const sumMetric = (name: string): number | null => {
          const values = lines.flatMap((line) => {
            const match = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([-+0-9.eE]+)$`).exec(line);
            return match ? [Number(match[1])] : [];
          });
          return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
        };
        databaseSizeMb = sumMetric("pg_database_size_mb");
        activeConnections = sumMetric("supavisor_connections_active");
      } else metricsError = `metrics_http_${metricsResponse.status}`;
    } catch { metricsError = "metrics_unavailable"; }
    if (metricsToken && active) {
      try {
        const usageResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/analytics/endpoints/usage.api-counts`, { headers: { Authorization: `Bearer ${metricsToken}`, Accept: "application/json" } });
        if (usageResponse.ok) {
          const usage = await usageResponse.json() as { result?: Array<{ total_storage_requests?: number; total_auth_requests?: number; total_realtime_requests?: number; total_rest_requests?: number }> };
          const latest = usage.result?.at(-1);
          if (latest) {
            storageRequests = latest.total_storage_requests ?? null;
            apiRequests = (latest.total_auth_requests ?? 0) + (latest.total_realtime_requests ?? 0) + (latest.total_rest_requests ?? 0) + (latest.total_storage_requests ?? 0);
            usageStatus = "available";
          } else usageStatus = "no_data";
        } else usageStatus = usageResponse.status === 401 || usageResponse.status === 403 ? "permission_required" : "provider_error";
      } catch { usageStatus = "provider_error"; }
      try {
        const diskResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project.id)}/config/disk/util`, { headers: { Authorization: `Bearer ${metricsToken}`, Accept: "application/json" } });
        if (diskResponse.ok) {
          const disk = await diskResponse.json() as { metrics?: { fs_used_bytes?: number } };
          diskUsedBytes = disk.metrics?.fs_used_bytes ?? null;
          diskStatus = diskUsedBytes === null ? "no_data" : "available";
        } else diskStatus = diskResponse.status === 401 || diskResponse.status === 403 ? "permission_required" : "provider_error";
      } catch { diskStatus = "provider_error"; }
    }
    return { id: project.id, name: project.name, status: project.status ?? "unknown", region: project.region ?? null, databaseSizeMb, activeConnections, storageRequests, apiRequests, diskUsedBytes, usageStatus, diskStatus, ...(metricsError ? { metricsError } : {}) };
  }));
  return { provider: "supabase", connected: true, supplementalTokenConfigured: metricsToken !== null, projects: result };
}

export async function handleServiceApi(request: Request, env: Env, session: Session): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/services/")) return null;
  if (request.method === "GET" && url.pathname === "/api/services/status") {
    const result = await Promise.all(([
      ["cloudflare", cloudflareSummary], ["supabase", supabaseSummary],
    ] as const).map(async ([provider, fetchSummary]) => {
      try {
        const token = await accessToken(env, session.login, provider);
        if (!token) return { provider, connected: false };
        if (provider === "supabase") {
          const sealedMetricsToken = await getAccountValue(env, session.login, "service:supabase:metrics-token");
          const metricsToken = typeof sealedMetricsToken === "string" ? await decryptSecret(env, sealedMetricsToken) : null;
          return await supabaseSummary(token, metricsToken);
        }
        return await fetchSummary(token);
      } catch { return { provider, connected: true, error: "metrics_unavailable" }; }
    }));
    return json({ services: result, updatedAt: new Date().toISOString() });
  }
  const provider = providerFromPath(url.pathname);
  if (!provider) return json({ error: "not_found" }, { status: 404 });
  if (provider === "supabase" && url.pathname === "/api/services/supabase/metrics-token") {
    if (request.method === "PUT") {
      let body: { token?: unknown };
      try { body = await request.json() as { token?: unknown }; } catch { return json({ error: "invalid_request" }, { status: 400 }); }
      if (typeof body.token !== "string" || !body.token.trim() || body.token.length > 8192) return json({ error: "invalid_token" }, { status: 400 });
      await putAccountValue(env, session.login, "service:supabase:metrics-token", await encryptSecret(env, body.token.trim()));
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await removeAccountValue(env, session.login, "service:supabase:metrics-token");
      return json({ ok: true });
    }
  }
  if (request.method === "POST" && url.pathname.endsWith("/connect")) return beginOAuth(env, provider, session.login);
  if (request.method === "DELETE" && url.pathname.endsWith("/connect")) {
    await revokeConnection(env, session.login, provider);
    if (provider === "supabase") await removeAccountValue(env, session.login, "service:supabase:metrics-token");
    return json({ ok: true });
  }
  return json({ error: "not_found" }, { status: 404 });
}
