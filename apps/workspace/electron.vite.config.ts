import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Must run before `require('electron')` — Vite reorders imeEnv side effects. */
const linuxImeEnvBanner = `
if (process.platform === "linux") {
  if (!process.env.GTK_IM_MODULE) process.env.GTK_IM_MODULE = "ibus";
  if (!process.env.QT_IM_MODULE) process.env.QT_IM_MODULE = "ibus";
  if (!process.env.XMODIFIERS) process.env.XMODIFIERS = "@im=ibus";
  if (!process.env.IBUS_ENABLE_SYNC_MODE) process.env.IBUS_ENABLE_SYNC_MODE = "1";
}
`

export default defineConfig({
  main: {
    esbuild: {
      // Vite passes this through as a string (not esbuild's { js, css } form).
      banner: linuxImeEnvBanner
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
