import { getDb } from '@/lib/db'
import { events } from '@cca/db/schema'
import { sql } from 'drizzle-orm'

export default async function HomePage() {
  const db = getDb()
  const [row] = await db.select({ c: sql<number>`count(*)` }).from(events)
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Claude Code Analytics</h1>
      <p className="text-muted-foreground mt-2">
        events in DB: {Number(row?.c ?? 0).toLocaleString()}
      </p>
    </main>
  )
}
