import { app, protocol } from 'electron'
import { PRIVILEGED_SCHEMES } from './protocolSchemeTable'
import { getBootstrapAppSupportDir } from './startupLog'

// Keep every Electron-owned store (including PKMS sync state, Chromium data,
// and PTY host identity) in the same dev/packaged profile as appSupportDir().
// This module is imported first by main/index.ts, before any of those stores
// are opened and before app is ready.
app.setPath('userData', getBootstrapAppSupportDir())

// Must run before app 'ready' — Chromium reads privileged-scheme
// registration once at startup. index.ts imports this first so the call
// happens at module load, ahead of app.whenReady().
protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES)
