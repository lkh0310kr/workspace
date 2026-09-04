import type { Session } from "electron";

// Port of ref-proj/orca's browser-webauthn-access.ts (the hardware-security-
// key half only — see the note above installBrowserWebAuthnAccessHandlers
// for why the discoverable-passkey account-picker half isn't ported).
// Passkey/Google-login actually working also depends on
// browserSessionUA.ts's Google-auth User-Agent override — Google's
// anti-fraud system flags Electron/Chromium-shaped requests on
// accounts.google.com and blocks or short-lives the sign-in, which is the
// most likely actual cause of "구글 로그인 시 패스키 동작 안 함" (a
// platform-authenticator/Touch ID passkey assertion never even gets a
// chance to run if the sign-in page itself is blocked first).

const FIDO_HID_USAGE_PAGE = 0xf1d0;
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isSecureBrowserOrigin(rawOrigin: string | undefined): boolean {
  if (!rawOrigin) return false;
  try {
    const origin = new URL(rawOrigin);
    return origin.protocol === "https:" || LOCALHOST_HOSTNAMES.has(origin.hostname);
  } catch {
    return false;
  }
}

function isFidoHidDevice(device: unknown): device is Electron.HIDDevice {
  if (!device || typeof device !== "object") return false;
  const collections = (device as { collections?: unknown }).collections;
  return (
    Array.isArray(collections) &&
    collections.some(
      (collection) =>
        collection &&
        typeof collection === "object" &&
        (collection as { usagePage?: unknown }).usagePage === FIDO_HID_USAGE_PAGE,
    )
  );
}

// 'hid' here is for *hardware* security keys (USB FIDO2 tokens), a
// separate permission from the platform authenticator (Touch ID) that
// most passkey flows actually use and which Chromium/Electron handles
// without an explicit permission grant.
export function allowsBrowserWebAuthnPermission(
  permission: string,
  details?: { securityOrigin?: string },
): boolean {
  return permission === "hid" && isSecureBrowserOrigin(details?.securityOrigin);
}

function handleSelectHidDevice(
  event: Electron.Event,
  details: Electron.SelectHidDeviceDetails,
  callback: (deviceId?: string) => void,
): void {
  event.preventDefault();
  if (!isSecureBrowserOrigin(details.frame?.url)) {
    callback(undefined);
    return;
  }
  const selectedDevice = details.deviceList.find(isFidoHidDevice);
  callback(selectedDevice?.deviceId);
}

// Orca (Electron ^43) also handles 'select-webauthn-account' — fired when
// a site has multiple discoverable passkeys and Chromium needs the app to
// pick one (Orca routes this through a full renderer picker dialog; a
// simplified "auto-pick the first credential" version would be enough
// here). This Electron pin (39.8.10) predates that event/type entirely —
// electron.d.ts has no 'select-webauthn-account'/SelectWebauthnAccountDetails
// at all — so it's left out rather than typed against an API that isn't
// there. A single-passkey-per-site flow (the common case) doesn't trigger
// this event in the first place; only a real multi-passkey account picker
// need would justify upgrading Electron to pick this up.
export function installBrowserWebAuthnAccessHandlers(sess: Session): void {
  sess.setDevicePermissionHandler((details) => {
    return (
      details.deviceType === "hid" &&
      isSecureBrowserOrigin(details.origin) &&
      isFidoHidDevice(details.device)
    );
  });
  sess.removeListener("select-hid-device", handleSelectHidDevice);
  sess.on("select-hid-device", handleSelectHidDevice);
}
