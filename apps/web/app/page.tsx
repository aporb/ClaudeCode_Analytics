import { resolveSince } from '@/lib/since'
import {
  getCostKpis, getSpendStackedByModel, getTopCostSessions,
  getCostDistribution, getCacheHitTrend, getActiveHoursHeatmap,
} from '@/lib/queries/cost'
import { computeBriefing } from '@/lib/briefing'
import { KpiStrip } from '@/components/cost/KpiStrip'
import { BriefingCard } from '@/components/cost/BriefingCard'
import { TopCostSessions } from '@/components/cost/TopCostSessions'
import { CostDistributionCard } from '@/components/cost/CostDistributionCard'
import { StackedAreaSpend } from '@/components/charts/StackedAreaSpend'
import { CacheHitTrend } from '@/components/charts/CacheHitTrend'
import { ActiveHoursHeatmap } from '@/components/charts/ActiveHoursHeatmap'
import { TokenHeadline } from '@/components/TokenHeadline'

export default async function CostHome({ searchParams }: { searchParams: Promise<{ since?: string; host?: string | string[] }> }) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const [kpis, spend, top, dist, cache, heatmap] = await Promise.all([
    getCostKpis(window),
    getSpendStackedByModel(window),
    getTopCostSessions(window, 5),
    getCostDistribution(window),
    getCacheHitTrend(window),
    getActiveHoursHeatmap(window),
  ])

  const yesterdayStart = new Date(); yesterdayStart.setHours(0, 0, 0, 0); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const yesterdayKpis = await getCostKpis({ start: yesterdayStart, end: todayStart })

  const topProjectRow = top[0]
  const briefing = computeBriefing({
    windowCost: kpis.windowCost,
    windowCostPriorPeriod: kpis.windowCostPriorPeriod,
    cacheHitPct: kpis.cacheHitPct,
    cacheHitPctPrior: kpis.cacheHitPctPrior,
    topProject: topProjectRow ? {
      project: topProjectRow.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? '(none)',
      model: topProjectRow.modelsUsed[0] ?? '',
      cost: topProjectRow.cost,
    } : null,
    windowLabel: window.label,
    isPartialDay: sp.since === 'today' && new Date().getHours() < 6,
  })

  return (
    <div className="space-y-4">
      <TokenHeadline searchParams={sp} />
      <KpiStrip kpis={kpis} todayPrior={yesterdayKpis.windowCost} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border rounded-md p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Spend per day · stacked by model · {window.label}
          </div>
          <StackedAreaSpend rows={spend} />
        </div>
        <BriefingCard briefing={briefing} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><TopCostSessions rows={top} /></div>
        <CostDistributionCard distribution={dist} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CacheHitTrend rows={cache} />
        <ActiveHoursHeatmap data={heatmap} />
      </div>
    </div>
  )
}
