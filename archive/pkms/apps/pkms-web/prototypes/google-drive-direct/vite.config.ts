import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const prototypeRoot = fileURLToPath(new URL('.', import.meta.url))
const outputDirectory = fileURLToPath(new URL('../../build/google-drive-direct-prototype', import.meta.url))

export default defineConfig({
  root: prototypeRoot,
  server: {
    host: 'localhost',
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true
  },
  appType: 'mpa'
})
