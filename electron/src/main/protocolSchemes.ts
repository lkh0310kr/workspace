import { protocol } from 'electron'
import { PRIVILEGED_SCHEMES } from './protocolSchemeTable'

// Must run before app 'ready' — Chromium reads privileged-scheme
// registration once at startup. index.ts imports this first so the call
// happens at module load, ahead of app.whenReady().
protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES)
