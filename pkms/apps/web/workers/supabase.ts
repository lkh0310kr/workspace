import type { Env } from "./env";

export class SupabaseError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Supabase request failed (${status}, ${code})`);
    this.name = "SupabaseError";
  }
}

export function supabaseUrl(env: Env): string {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  return env.SUPABASE_URL.replace(/\/$/, "");
}

export async function supabaseRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl(env)}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string; error?: string };
    throw new SupabaseError(response.status, String(body.code ?? body.error ?? "database_request_failed").slice(0, 80));
  }
  return response;
}

export async function supabaseRpc<T>(env: Env, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await supabaseRequest(env, `/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  return response.json() as Promise<T>;
}

export function restFilter(value: string): string {
  return encodeURIComponent(value);
}
