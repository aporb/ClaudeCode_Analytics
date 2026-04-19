import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

type Db = ReturnType<typeof drizzle<typeof schema>>

let _client: postgres.Sql | null = null
let _db: Db | null = null

export function getDb(url?: string): Db {
  if (_db) return _db
  const connectionString = url ?? process.env.CCA_DATABASE_URL
  if (!connectionString) {
    throw new Error('CCA_DATABASE_URL is not set')
  }
  _client = postgres(connectionString, { max: 10, prepare: false })
  _db = drizzle(_client, { schema })
  return _db
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end()
    _client = null
    _db = null
  }
}
