import { shell } from 'electron'
import { GoogleDriveDesktopOAuth } from './googleDriveDesktopOAuth'
import { ElectronGoogleDriveCredentialStore } from './googleDriveDesktopCredentialStore'

// OAuth client IDs are public identifiers. The environment override allows local
// projects to use a separate client, while packaged Desktop builds work by default.
const DEFAULT_DESKTOP_CLIENT_ID =
  '130397210046-s06i052i2aio8bsqb5rsnn2s6omfupqs.apps.googleusercontent.com'
const desktopClientId = process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_ID || DEFAULT_DESKTOP_CLIENT_ID

export const googleDriveDesktopOAuth = new GoogleDriveDesktopOAuth({
  clientId: desktopClientId,
  credentialStore: new ElectronGoogleDriveCredentialStore(),
  openExternal: (url) => shell.openExternal(url)
})

export function googleDriveDesktopOAuthConfiguration() {
  return {
    credentialStored: googleDriveDesktopOAuth.credentialStored,
    clientConfigured: Boolean(desktopClientId)
  }
}
