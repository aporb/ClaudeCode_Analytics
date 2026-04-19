import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: resolve(process.cwd(), '../../.env.local') })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.CCA_DATABASE_URL
  if (!url) throw new Error('CCA_DATABASE_URL not set')
  const sql = postgres(url, { max: 1 })
  const db = drizzle(sql)
  await migrate(db, { migrationsFolder: './drizzle' })
  // Also apply the raw-SQL migrations that drizzle-kit can't express
  for (const f of ['0001_events_gin.sql', '0003_messages_indexes.sql', '0010_usage_daily_view.sql', '0005_prompts_history_dedup_fix.sql']) {
    const path = resolve(__dirname, '..', 'drizzle', f)
    try {
      const fs = await import('node:fs/promises')
      const body = await fs.readFile(path, 'utf8')
      await sql.unsafe(body)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  await sql.end()
  console.log('migrations applied')
}

main().catch((e) => { console.error(e); process.exit(1) })
