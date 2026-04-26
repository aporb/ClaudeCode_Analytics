import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@cca/db': path.resolve(__dirname, '../../packages/db/src'),
      '@cca/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
})
