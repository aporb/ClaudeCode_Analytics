import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'

/**
 * Returns the union of distinct hosts seen in the events table plus the
 * implicit `'local'` host (always present, even before any remote sync).
 *
 * Used to populate the host filter chip in the nav. Sorted alphabetically,
 * with `'local'` guaranteed to appear at least once.
 */
export async function getAllHosts(): Promise<string[]> {
  const db = getDb()
  const rows = (await db.execute<{ host: string }>(sql`
    SELECT DISTINCT host FROM events
    UNION
    SELECT 'local' AS host
    ORDER BY host
  `)) as unknown as Array<{ host: string }>
  return rows.map((r) => r.host).filter(Boolean)
}
