import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionEvents, getSessionMeta, getSessionToolCalls } from '@/lib/queries'
import { EventRow } from '@/components/EventRow'
import { ToolCallDetails } from '@/components/ToolCallDetails'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ raw?: string }>
}

export default async function SessionPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const isRaw = sp.raw === '1' || sp.raw === 'true'
  const [meta, evs, tools] = await Promise.all([
    getSessionMeta(id),
    getSessionEvents(id),
    getSessionToolCalls(id),
  ])
  if (!meta) notFound()
  const toolsByUuid = new Map(tools.map((t) => [t.uuid, t]))

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
          <Link
            href={isRaw ? `/session/${id}` : `/session/${id}?raw=1`}
            className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground ml-2"
          >
            {isRaw ? 'hide secrets' : 'show raw'}
          </Link>
        </div>
      </header>

      <div className="border rounded-md divide-y">
        {evs.map((e) => (
          <div key={e.uuid}>
            <EventRow
              event={{
                uuid: e.uuid,
                type: e.type,
                subtype: e.subtype,
                timestamp: e.timestamp,
                isSidechain: e.isSidechain,
                payload: e.payload,
              }}
              raw={isRaw}
            />
            {toolsByUuid.has(e.uuid) && (
              <ToolCallDetails
                call={{
                  uuid: e.uuid,
                  toolName: toolsByUuid.get(e.uuid)!.toolName,
                  input: toolsByUuid.get(e.uuid)!.input,
                  result: toolsByUuid.get(e.uuid)!.result,
                  durationMs: toolsByUuid.get(e.uuid)!.durationMs,
                  isError: toolsByUuid.get(e.uuid)!.isError,
                }}
                raw={isRaw}
              />
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
