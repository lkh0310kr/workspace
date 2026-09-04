import type { Session as ElectronSession } from "electron";

// Port of ref-proj/orca's browser-session-ua.ts + browser-google-auth-ua.ts,
// trimmed to what a single-profile personal app needs (Orca's version also
// threads a per-profile googleAuthOverride toggle for its multi-account
// session model, which doesn't apply here).

const GOOGLE_AUTH_HOSTS = new Set(["accounts.google.com", "accounts.youtube.com"]);

function isGoogleAuthUrl(rawUrl: string): boolean {
  try {
    return GOOGLE_AUTH_HOSTS.has(new URL(rawUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Google binds a signed-in session to the browser identity that created it.
// A request under an Electron/Chrome-shaped UA that doesn't match a real
// first-party browser gets flagged by Google's anti-fraud on
// accounts.google.com — passkey/2FA challenges silently fail or the session
// cookie expires within ~1h. Presenting a Firefox identity scoped to
// Google's auth hosts lets the user sign in *inside* the embedded browser,
// so Google issues cookies bound to THIS browser that self-refresh. Scope
// is deliberately the auth hosts only — post-auth app surfaces (mail,
// drive, etc.) keep the real Chrome-shaped identity.
function googleAuthUserAgent(): string {
  const platform =
    process.platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10.15"
      : process.platform === "win32"
        ? "Windows NT 10.0; Win64; x64"
        : "X11; Linux x86_64";
  return `Mozilla/5.0 (${platform}; rv:140.0) Gecko/20100101 Firefox/140.0`;
}

function stripClientHints(headers: Record<string, string>): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase().startsWith("sec-ch-ua")) delete headers[key];
  }
}

function setUserAgentHeader(headers: Record<string, string>, value: string): void {
  const existing = Object.keys(headers).find((key) => key.toLowerCase() === "user-agent");
  headers[existing ?? "User-Agent"] = value;
}

function currentUserAgent(headers: Record<string, string>): string | undefined {
  const existing = Object.keys(headers).find((key) => key.toLowerCase() === "user-agent");
  return existing ? headers[existing] : undefined;
}

// Electron's default UA includes "Electron/X.X.X" and the app name (e.g.
// "workspace-app/0.1.0"), which bot detectors (Cloudflare Turnstile, etc.)
// flag as non-human traffic.
export function cleanElectronUserAgent(ua: string): string {
  return ua
    .replace(/\s+Electron\/\S+/, "")
    .replace(/(\)\s+)\S+\s+(Chrome\/)/, "$1$2");
}

function buildChromeClientHints(ua: string): { secChUa: string; secChUaFull: string } | null {
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  if (!chromeMatch) return null;
  const fullChromeVersion = chromeMatch[1];
  const majorVersion = fullChromeVersion.split(".")[0];
  return {
    secChUa: `"Google Chrome";v="${majorVersion}", "Chromium";v="${majorVersion}", "Not/A)Brand";v="24"`,
    secChUaFull: `"Google Chrome";v="${fullChromeVersion}", "Chromium";v="${fullChromeVersion}", "Not/A)Brand";v="24.0.0.0"`,
  };
}

// Rewrites the User-Agent + sec-ch-ua Client Hints headers on every outgoing
// request from `sess`: a Chrome-shaped identity everywhere, except a Firefox
// identity scoped to Google's sign-in hosts (see googleAuthUserAgent above).
export function setupBrowserSessionUA(sess: ElectronSession): void {
  const cleanUA = cleanElectronUserAgent(sess.getUserAgent());
  sess.setUserAgent(cleanUA);
  const chromeHints = buildChromeClientHints(cleanUA);
  const firefoxUa = googleAuthUserAgent();

  sess.webRequest.onBeforeSendHeaders({ urls: ["https://*/*"] }, (details, callback) => {
    const headers = details.requestHeaders;
    if (isGoogleAuthUrl(details.url)) {
      setUserAgentHeader(headers, firefoxUa);
      stripClientHints(headers);
      callback({ requestHeaders: headers });
      return;
    }
    if (currentUserAgent(headers) === firefoxUa) {
      // The auth document itself is showing Firefox — its cross-host
      // subresource requests (gstatic, the sign-in challenge endpoints)
      // reach here still carrying the Firefox UA. Pairing a Firefox UA
      // with Chromium client hints is a sharper cross-host mismatch than
      // either alone, so strip the hints rather than rewrite them.
      stripClientHints(headers);
      callback({ requestHeaders: headers });
      return;
    }
    if (chromeHints) {
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (lower === "sec-ch-ua") headers[key] = chromeHints.secChUa;
        else if (lower === "sec-ch-ua-full-version-list") headers[key] = chromeHints.secChUaFull;
      }
    }
    callback({ requestHeaders: headers });
  });
}
