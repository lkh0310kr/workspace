import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: [
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
    include: ['src/**/*.test.ts'],
    poolOptions: {
      forks: { execArgv: ['--expose-gc'] },
      threads: { execArgv: ['--expose-gc'] }
    }
  }
})
