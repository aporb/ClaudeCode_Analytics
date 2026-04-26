import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@cca/db': path.resolve(__dirname, '../../packages/db/src'),
      '@cca/core': path.resolve(__dirname, '../../packages/core/src'),
      'server-only': path.resolve(__dirname, './__mocks__/server-only.ts'),
    },
  },
})
