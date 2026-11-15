import { shell } from 'electron'
import { GoogleDriveDesktopOAuth } from './googleDriveDesktopOAuth'
import { ElectronGoogleDriveCredentialStore } from './googleDriveDesktopCredentialStore'

export const googleDriveDesktopOAuth = new GoogleDriveDesktopOAuth({
  clientId: process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_ID,
  credentialStore: new ElectronGoogleDriveCredentialStore(),
  openExternal: (url) => shell.openExternal(url)
})

export function googleDriveDesktopOAuthConfiguration() {
  return {
    credentialStored: googleDriveDesktopOAuth.credentialStored,
    clientConfigured: Boolean(process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_ID)
  }
}
