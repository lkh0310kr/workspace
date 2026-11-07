import type { Env, Session } from "./env";

const jwk = {
  kty: "EC", crv: "P-256", alg: "ES256", use: "sig",
  kid: "pkms-64825bda-dec8-4a78-b684-25f96cb3ae2f",
  x: "5ymjI5jH68IVEJJzIMMyPpJRn9qPwG4g_2tnT8ap6SE",
  y: "RZaJ7b2kgbsMU_YolZabaY_itjO9wUCqU7Ll07xsgdQ",
};
const text = new TextEncoder();
const base64url = (bytes: Uint8Array) => {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
function encode(value: unknown): string { return base64url(text.encode(JSON.stringify(value))); }
function uuidFromDigest(bytes: Uint8Array): string {
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0"));
  hex[6] = ((parseInt(hex[6], 16) & 0x0f) | 0x50).toString(16);
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16);
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function openIdConfiguration(env: Env): Record<string, unknown> {
  const issuer = env.PUBLIC_ORIGIN.replace(/\/$/, "");
  return {
    issuer,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
  };
}

export function publicJwks(): { keys: typeof jwk[] } { return { keys: [jwk] }; }

export async function issueRealtimeToken(env: Env, session: Session): Promise<{ token: string; expiresAt: number }> {
  if (!env.PKMS_REALTIME_PRIVATE_KEY || env.PKMS_REALTIME_KEY_ID !== jwk.kid) throw new Error("realtime_signing_key_unavailable");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 15 * 60;
  const subjectHash = await crypto.subtle.digest("SHA-256", text.encode(`pkms-realtime\0${session.login.toLowerCase()}`));
  const header = encode({ alg: "ES256", typ: "JWT", kid: jwk.kid });
  const payload = encode({
    iss: env.PUBLIC_ORIGIN.replace(/\/$/, ""),
    sub: uuidFromDigest(new Uint8Array(subjectHash)),
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: expiresAt,
    app_metadata: { github_login: session.login.toLowerCase(), provider: "pkms" },
    user_metadata: { login: session.login, avatar_url: session.avatarUrl ?? null },
  });
  const signingInput = `${header}.${payload}`;
  const privateBytes = Uint8Array.from(atob(env.PKMS_REALTIME_PRIVATE_KEY), (character) => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, text.encode(signingInput)));
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: expiresAt * 1000 };
}

export async function issueWorkspaceHomeToken(env: Env, session: Session): Promise<{ token: string; expiresAt: number }> {
  if (!env.PKMS_REALTIME_PRIVATE_KEY || env.PKMS_REALTIME_KEY_ID !== jwk.kid) throw new Error("home_signing_key_unavailable");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 5 * 60;
  const header = encode({ alg: "ES256", typ: "JWT", kid: jwk.kid });
  const payload = encode({
    iss: env.PUBLIC_ORIGIN.replace(/\/$/, ""),
    sub: session.login.toLowerCase(),
    aud: env.WORKSPACE_HOME_AUDIENCE ?? "workspace-home",
    scope: "workspace-home",
    iat: now,
    exp: expiresAt,
  });
  const signingInput = `${header}.${payload}`;
  const privateBytes = Uint8Array.from(atob(env.PKMS_REALTIME_PRIVATE_KEY), character => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, text.encode(signingInput)));
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: expiresAt * 1000 };
}
