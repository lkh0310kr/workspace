import type { Env } from "./env";

export async function getAccountValue(env: Env, login: string, key: string): Promise<unknown | null> {
  const row = await env.HOME_DB.prepare("SELECT value_json FROM home_values WHERE login = ?1 AND value_key = ?2")
    .bind(login.toLowerCase(), key).first<{ value_json: string }>();
  if (!row) return null;
  return JSON.parse(row.value_json) as unknown;
}

export async function putAccountValue(env: Env, login: string, key: string, value: unknown): Promise<void> {
  await env.HOME_DB.prepare("INSERT INTO home_values (login, value_key, value_json, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP) ON CONFLICT(login, value_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
    .bind(login.toLowerCase(), key, JSON.stringify(value)).run();
}

export async function removeAccountValue(env: Env, login: string, key: string): Promise<void> {
  await env.HOME_DB.prepare("DELETE FROM home_values WHERE login = ?1 AND value_key = ?2").bind(login.toLowerCase(), key).run();
}
