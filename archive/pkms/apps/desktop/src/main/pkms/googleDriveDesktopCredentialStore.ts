import { safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { appSupportDir } from '../persistence'
import type { GoogleDriveDesktopCredentialStore } from './googleDriveDesktopOAuth'

const CREDENTIAL_FILE = 'pkms-google-drive-refresh-token.safe'

export class ElectronGoogleDriveCredentialStore implements GoogleDriveDesktopCredentialStore {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  readRefreshToken(): string | null {
    if (!this.isAvailable()) return null
    try {
      return safeStorage.decryptString(fs.readFileSync(this.filePath()))
    } catch {
      return null
    }
  }

  writeRefreshToken(token: string): void {
    if (!this.isAvailable()) throw new Error('Electron secure credential storage is unavailable.')
    const directory = appSupportDir()
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const target = this.filePath()
    const temporary = `${target}.${process.pid}.tmp`
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(token), { mode: 0o600 })
      fs.renameSync(temporary, target)
    } finally {
      try {
        fs.unlinkSync(temporary)
      } catch {
        // The temporary file may already have been moved into place.
      }
    }
  }

  clear(): void {
    try {
      fs.unlinkSync(this.filePath())
    } catch (cause) {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'ENOENT')
        throw cause
    }
  }

  private filePath(): string {
    return path.join(appSupportDir(), CREDENTIAL_FILE)
  }
}
