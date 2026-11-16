import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '')
const desktopOAuthSecret =
  process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET || env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET
const driveAllowedEmails =
  process.env.GOOGLE_DRIVE_ALLOWED_EMAILS || env.GOOGLE_DRIVE_ALLOWED_EMAILS

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
    define: {
      'process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET': JSON.stringify(desktopOAuthSecret),
      'process.env.GOOGLE_DRIVE_ALLOWED_EMAILS': JSON.stringify(driveAllowedEmails)
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          ptyHostDaemon: resolve('src/main/ptyHostDaemon.ts')
        },
        output: { entryFileNames: '[name].js' }
      }
    },
    esbuild: {
      // Vite passes this through as a string (not esbuild's { js, css } form).
      banner: linuxImeEnvBanner
    }
  },
  preload: {},
  renderer: {
    resolve: {
      dedupe: [
        'react',
        'react-dom',
        'react-router',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/lang-markdown',
        '@codemirror/autocomplete',
        '@codemirror/search',
        '@codemirror/language-data',
        '@lezer/common',
        '@lezer/lr',
        '@lezer/highlight',
        '@lezer/markdown'
      ],
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@workspace/editor': resolve('../../packages/editor/src'),
        '@workspace/home': resolve('../../packages/home/src'),
        '@workspace/browser': resolve('../../packages/browser/src'),
        '@workspace/terminal': resolve('../../packages/terminal/src'),
        '@xterm': resolve('node_modules/@xterm')
      }
    },
    plugins: [react()]
  }
})
