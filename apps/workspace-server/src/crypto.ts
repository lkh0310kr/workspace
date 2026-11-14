import type { Env } from './env'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const b64url = (bytes: Uint8Array) => {
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const unb64url = (value: string) =>
  Uint8Array.from(
    atob(
      value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=')
    ),
    (c) => c.charCodeAt(0)
  )

async function key(env: Env): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(env.HOME_DATA_ENCRYPTION_KEY), (c) => c.charCodeAt(0))
  if (raw.length !== 32) throw new Error('home_encryption_key_must_be_32_bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), encoder.encode(value))
  )
  return `${b64url(iv)}.${b64url(cipher)}`
}

export async function decryptSecret(env: Env, value: string): Promise<string> {
  const [iv, cipher, extra] = value.split('.')
  if (!iv || !cipher || extra) throw new Error('invalid_encrypted_value')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64url(iv) },
    await key(env),
    unb64url(cipher)
  )
  return decoder.decode(plaintext)
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { ...init, headers })
}
