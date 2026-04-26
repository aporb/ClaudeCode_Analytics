import {
  getSessionMeta, getSessionEvents, getSessionToolCalls,
  getSessionStats, getSessionTopTools, getSessionFilesTouched, getSessionFirstPrompts,
} from '@/lib/queries/session'
import { Badge } from '@/components/ui/badge'
import { EventRow } from '@/components/EventRow'
import { ToolCallDetails } from '@/components/ToolCallDetails'
import { StatsStrip } from '@/components/session/StatsStrip'
import { TopToolsPanel } from '@/components/session/TopToolsPanel'
import { FilesTouchedPanel } from '@/components/session/FilesTouchedPanel'
import { CostSplitPanel } from '@/components/session/CostSplitPanel'
import { FirstPromptsStrip } from '@/components/session/FirstPromptsStrip'
import { CollapsibleReplay } from '@/components/session/CollapsibleReplay'
import { notFound } from 'next/navigation'
import Link from 'next/link'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

function shortProject(p: string | null): string { return p ? p.replace(/^\/Users\/[^/]+\//, '~/') : '(none)' }

export default async function SessionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ raw?: string; replay?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const raw = sp.raw === '1'
  const replayOpen = sp.replay === '1'

  const meta = await getSessionMeta(id)
  if (!meta) notFound()

  const [stats, topTools, files, firstPrompts, events, toolCalls] = await Promise.all([
    getSessionStats(id),
    getSessionTopTools(id, 5),
    getSessionFilesTouched(id, 5),
    getSessionFirstPrompts(id, 3),
    getSessionEvents(id),
    getSessionToolCalls(id),
  ])

  const totalCost = stats.costByModel.reduce((s, r) => s + r.cost, 0)
  const toolErrorCount = topTools.reduce((s, r) => s + r.errors, 0)
  const toolsByUuid = new Map(toolCalls.map((t) => [t.uuid, t]))

  // build toggle hrefs that preserve the other param
  const rawHref = `?${new URLSearchParams({ ...(raw ? {} : { raw: '1' }), ...(replayOpen ? { replay: '1' } : {}) }).toString()}`

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        <Link href="/sessions" className="hover:underline">/sessions</Link> / {id.slice(0, 8)}…
      </div>
      <div>
        <h1 className="text-xl font-bold">
          {shortProject(meta.projectPath)} · {new Date(meta.startedAt!).toLocaleString()}
          {meta.endedAt && ` → ${new Date(meta.endedAt).toLocaleString()}`}
          {meta.durationSec ? ` (${Math.round(meta.durationSec / 60)}m)` : ''}
        </h1>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {(meta.modelsUsed ?? []).map((m: string) => (
            <Badge key={m} variant="outline" className={modelChipClass(m)}>
              {m.replace(/^claude-/, '').replace(/-\d+$/, '')}
            </Badge>
          ))}
          {meta.gitBranch && <span>· {meta.gitBranch}</span>}
          {meta.ccVersion && <span>· cca-v{meta.ccVersion}</span>}
          <Link href={rawHref || '?'} className="ml-auto hover:underline">
            {raw ? 'redact' : '?raw=1'}
          </Link>
        </div>
      </div>

      <StatsStrip
        cost={totalCost}
        messages={meta.messageCount ?? 0}
        toolCalls={meta.toolCallCount ?? 0}
        toolErrors={toolErrorCount}
        cacheHitPct={stats.cacheHitPct}
        subagents={meta.subagentCount ?? 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopToolsPanel rows={topTools} />
        <FilesTouchedPanel data={files} />
        <CostSplitPanel
          costByModel={stats.costByModel}
          inputTokens={stats.inputTokens}
          outputTokens={stats.outputTokens}
          cacheReadTokens={stats.cacheReadTokens}
        />
      </div>

      <FirstPromptsStrip rows={firstPrompts} />

      <CollapsibleReplay
        initialOpen={replayOpen}
        count={{ messages: meta.messageCount ?? 0, toolCalls: meta.toolCallCount ?? 0 }}
      >
        <div className="border rounded-md divide-y">
          {events.map((e) => (
            <div key={e.uuid}>
              <EventRow
                event={{
                  uuid: e.uuid, type: e.type, subtype: e.subtype,
                  timestamp: e.timestamp, isSidechain: e.isSidechain, payload: e.payload,
                }}
                raw={raw}
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
                  raw={raw}
                />
              )}
            </div>
          ))}
        </div>
      </CollapsibleReplay>
    </div>
  )
}
