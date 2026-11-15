import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const workspaceRoot = resolve(import.meta.dirname, '../../../..')

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@workspace/editor': resolve(workspaceRoot, 'packages/editor/src'),
      '@pkms/google-drive': resolve(workspaceRoot, 'packages/pkms-google-drive/src'),
      '@pkms/client': resolve(workspaceRoot, 'packages/pkms-client/src'),
      '@pkms/protocol': resolve(workspaceRoot, 'packages/pkms-protocol/src'),
      '@renderer': resolve(workspaceRoot, 'apps/workspace-app/src/renderer/src')
    }
  },
  server: { host: '127.0.0.1', port: 4179, strictPort: true }
})
