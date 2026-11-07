import type { Env, Session } from "./env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string): Uint8Array {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function base64url(bytes: Uint8Array): string {
  return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function signSession(env: Env, session: Session): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${base64url(await hmac(env.SESSION_SECRET, payload))}`;
}

export async function verifySession(env: Env, value: string | undefined): Promise<Session | null> {
  return (await verifySessionDetailed(env, value)).session;
}

export async function verifySessionDetailed(env: Env, value: string | undefined): Promise<{ session: Session | null; reason: "missing" | "malformed" | "bad_signature" | "invalid_payload" | "expired" | "valid" }> {
  if (!value) return { session: null, reason: "missing" };
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return { session: null, reason: "malformed" };
  const expected = base64url(await hmac(env.SESSION_SECRET, payload));
  if (!constantTimeEqual(signature, expected)) return { session: null, reason: "bad_signature" };
  try {
    const session = JSON.parse(decoder.decode(unbase64(payload))) as Session;
    if (!session.login || typeof session.expiresAt !== "number") return { session: null, reason: "invalid_payload" };
    if (session.expiresAt <= Date.now()) return { session: null, reason: "expired" };
    return { session, reason: "valid" };
  } catch {
    return { session: null, reason: "invalid_payload" };
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function encryptSecret(env: Env, value: string): Promise<string> {
  const keyBytes = unbase64(env.DATA_ENCRYPTION_KEY);
  if (keyBytes.byteLength !== 32) throw new Error("DATA_ENCRYPTION_KEY must be base64-encoded 32-byte key material");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, asArrayBuffer(encoder.encode(value))));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return base64(combined);
}

export async function decryptSecret(env: Env, value: string): Promise<string> {
  const keyBytes = unbase64(env.DATA_ENCRYPTION_KEY);
  if (keyBytes.byteLength !== 32) throw new Error("DATA_ENCRYPTION_KEY must be base64-encoded 32-byte key material");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  const combined = unbase64(value);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(combined.slice(0, 12)) }, key, asArrayBuffer(combined.slice(12)));
  return decoder.decode(plaintext);
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie") ?? "";
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return undefined;
}

export function sessionCookie(value: string, maxAge: number): string {
  return `__Host-pkms_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
