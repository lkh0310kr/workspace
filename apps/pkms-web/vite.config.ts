import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@pkms/client': resolve('../../packages/pkms-client/src')
    }
  },
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), reactRouter()]
})
