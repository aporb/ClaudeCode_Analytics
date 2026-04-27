import { resolve } from 'node:path'
import { config } from 'dotenv'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { defineConfig } from 'drizzle-kit'

const url = process.env.CCA_DATABASE_URL
if (!url) throw new Error('CCA_DATABASE_URL is not set (check .env.local)')

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
