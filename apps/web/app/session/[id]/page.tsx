import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionEvents, getSessionMeta } from '@/lib/queries'
import { EventRow } from '@/components/EventRow'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: PageProps) {
  const { id } = await params
  const [meta, evs] = await Promise.all([getSessionMeta(id), getSessionEvents(id)])
  if (!meta) notFound()

  return (
    <main>
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← sessions</Link>
      <header className="mt-4 mb-6 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{meta.sessionId.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground mt-1">{meta.projectPath ?? '(no project)'}</p>
          {meta.firstUserPrompt && (
            <p className="text-sm mt-2 max-w-2xl">{meta.firstUserPrompt.replace(/\s+/g, ' ').slice(0, 200)}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap text-xs items-center">
          {meta.status === 'active' ? <Badge variant="success">active</Badge> : <Badge variant="outline">ended</Badge>}
          <Badge variant="outline">{meta.messageCount ?? 0} msgs</Badge>
          <Badge variant="outline">{meta.toolCallCount ?? 0} tools</Badge>
          {meta.durationSec ? <Badge variant="outline">{Math.round(meta.durationSec / 60)}m</Badge> : null}
          {meta.estimatedCostUsd ? <Badge variant="outline">${Number(meta.estimatedCostUsd).toFixed(2)}</Badge> : null}
        </div>
      </header>

      <div className="border rounded-md divide-y">
        {evs.map((e) => (
          <EventRow
            key={e.uuid}
            event={{
              uuid: e.uuid,
              type: e.type,
              subtype: e.subtype,
              timestamp: e.timestamp,
              isSidechain: e.isSidechain,
              payload: e.payload,
            }}
          />
        ))}
      </div>
    </main>
  )
}
