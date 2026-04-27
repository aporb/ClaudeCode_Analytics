import 'server-only'
import * as schema from '@cca/db/schema'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

type Db = ReturnType<typeof drizzle<typeof schema>>

const globalForDb = globalThis as unknown as { ccaSql?: postgres.Sql; ccaDb?: Db }

export function getDb(): Db {
  if (globalForDb.ccaDb) return globalForDb.ccaDb
  const url = process.env.CCA_DATABASE_URL
  if (!url) throw new Error('CCA_DATABASE_URL is not set')
  globalForDb.ccaSql = postgres(url, { max: 10, prepare: false })
  globalForDb.ccaDb = drizzle(globalForDb.ccaSql, { schema })
  return globalForDb.ccaDb
}
