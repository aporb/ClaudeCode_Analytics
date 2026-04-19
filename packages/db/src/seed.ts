import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { getDb, closeDb } from './client.js'
import { modelPricing } from './schema/index.js'
import { sql } from 'drizzle-orm'

// Per Anthropic public pricing as of 2026-04 (USD per 1M tokens).
// Cache write prices: 5m ephemeral = 1.25x input; 1h ephemeral = 2x input.
// Update effective_from when you refresh these values.
const EFFECTIVE_FROM = new Date('2026-01-01T00:00:00Z')
const PRICES = [
  { model: 'claude-opus-4-7',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-7[1m]', input: 15, output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-6',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-opus-4-5',   input: 15,  output: 75, write5m: 18.75, write1h: 30, read: 1.5 },
  { model: 'claude-sonnet-4-6', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-sonnet-4-5', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-sonnet-4-0', input: 3,   output: 15, write5m: 3.75,  write1h: 6,  read: 0.3 },
  { model: 'claude-haiku-4-5',  input: 1,   output: 5,  write5m: 1.25,  write1h: 2,  read: 0.1 },
  { model: 'claude-haiku-4-5-20251001', input: 1, output: 5, write5m: 1.25, write1h: 2, read: 0.1 },
]

async function main() {
  const db = getDb()
  for (const p of PRICES) {
    await db
      .insert(modelPricing)
      .values({
        model: p.model,
        inputPerMtok: p.input.toString(),
        outputPerMtok: p.output.toString(),
        cacheWrite5mPerMtok: p.write5m.toString(),
        cacheWrite1hPerMtok: p.write1h.toString(),
        cacheReadPerMtok: p.read.toString(),
        effectiveFrom: EFFECTIVE_FROM,
      })
      .onConflictDoUpdate({
        target: modelPricing.model,
        set: {
          inputPerMtok: sql`excluded.input_per_mtok`,
          outputPerMtok: sql`excluded.output_per_mtok`,
          cacheWrite5mPerMtok: sql`excluded.cache_write_5m_per_mtok`,
          cacheWrite1hPerMtok: sql`excluded.cache_write_1h_per_mtok`,
          cacheReadPerMtok: sql`excluded.cache_read_per_mtok`,
          effectiveFrom: sql`excluded.effective_from`,
        },
      })
  }
  console.log(`seeded ${PRICES.length} model prices`)
  await closeDb()
}

main().catch((e) => { console.error(e); process.exit(1) })
