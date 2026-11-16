import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const sandboxRoot = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(sandboxRoot, '../../../..')

export default defineConfig({
  root: sandboxRoot,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@workspace/home': resolve(workspaceRoot, 'packages/home/src/index.ts'),
      '@workspace/browser': resolve(workspaceRoot, 'packages/browser/src/index.ts'),
      '@workspace/terminal': resolve(workspaceRoot, 'packages/terminal/src/index.ts'),
      '@workspace/ui': resolve(workspaceRoot, 'packages/ui/src/index.ts')
    }
  },
  server: { host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true }
})
