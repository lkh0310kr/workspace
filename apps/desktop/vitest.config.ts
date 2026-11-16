import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const desktopRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: /^vitest$/, replacement: resolve(desktopRoot, 'node_modules/vitest/dist/index.js') },
      { find: /^@xterm\/(.*)$/, replacement: resolve(desktopRoot, 'node_modules/@xterm/$1') }
    ],
    dedupe: [
      'react',
      'react-dom',
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
    ]
  },
  test: {
    include: ['src/**/*.test.ts', '../../packages/**/*.test.ts'],
    poolOptions: {
      forks: { execArgv: ['--expose-gc'] },
      threads: { execArgv: ['--expose-gc'] }
    }
  }
})
