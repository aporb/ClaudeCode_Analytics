import { listSessions } from '@/lib/queries'
import { SessionsTable } from '@/components/SessionsTable'

export default async function HomePage() {
  const rows = await listSessions({ limit: 50 })
  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Sessions</h1>
      <SessionsTable rows={rows} />
    </main>
  )
}
