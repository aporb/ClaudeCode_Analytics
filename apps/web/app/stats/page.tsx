import { LatencyPercentiles } from '@/components/charts/LatencyPercentiles'
import { SubagentHistogram } from '@/components/charts/SubagentHistogram'
import { TokenVelocityScatter } from '@/components/charts/TokenVelocityScatter'
import { ToolErrorRateTrend } from '@/components/charts/ToolErrorRateTrend'
import { Badge } from '@/components/ui/badge'
import {
  getCacheHitByModel,
  getLatencyPercentiles,
  getSubagentHistogram,
  getTokenVelocity,
  getToolErrorRateTrend,
} from '@/lib/queries/behavior'
import { resolveSince } from '@/lib/since'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet'))
    return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku'))
    return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export default async function BehaviorPage({
  searchParams,
}: { searchParams: Promise<{ since?: string }> }) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const [errors, latency, subagents, velocity, cacheByModel] = await Promise.all([
    getToolErrorRateTrend(window),
    getLatencyPercentiles(window),
    getSubagentHistogram(window),
    getTokenVelocity(window),
    getCacheHitByModel(window),
  ])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Behavior · {window.label}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ToolErrorRateTrend rows={errors} />
        <LatencyPercentiles rows={latency} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SubagentHistogram rows={subagents} />
        <div className="border border-border rounded-md p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Cache hit % by model
          </div>
          {cacheByModel.length === 0 && (
            <div className="text-sm text-muted-foreground">No data.</div>
          )}
          {cacheByModel.map((r) => (
            <div
              key={r.model}
              className="flex justify-between py-1 border-b border-border last:border-0 text-sm"
            >
              <Badge variant="outline" className={modelChipClass(r.model)}>
                {r.model.replace(/^claude-/, '').replace(/-\d+$/, '')}
              </Badge>
              <span className="font-bold">{Math.round(r.hitPct * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
      <TokenVelocityScatter rows={velocity} />
    </div>
  )
}
