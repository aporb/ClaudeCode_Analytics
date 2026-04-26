import type { CostKpis } from '@/lib/queries/cost'

function fmtUsd(n: number): string { return n < 0.01 ? '$0.00' : `$${n.toFixed(2)}` }

function deltaUsd(curr: number, prior: number): { text: string; cls: string } {
  if (!Number.isFinite(prior) || prior === 0) return { text: '—', cls: 'opacity-60' }
  const pct = (curr - prior) / prior
  const sign = pct >= 0 ? '+' : '−'
  const cls = pct >= 0 ? 'text-red-500' : 'text-green-500'
  return { text: `${sign}${Math.round(Math.abs(pct) * 100)}%`, cls }
}

function deltaPp(curr: number, prior: number): { text: string; cls: string } {
  if (!Number.isFinite(prior)) return { text: '—', cls: 'opacity-60' }
  const pp = Math.round((curr - prior) * 100)
  if (pp === 0) return { text: 'flat', cls: 'opacity-60' }
  const sign = pp >= 0 ? '+' : '−'
  const cls = pp >= 0 ? 'text-green-500' : 'text-red-500'
  return { text: `${sign}${Math.abs(pp)}pp`, cls }
}

export function KpiStrip({ kpis, todayPrior }: { kpis: CostKpis; todayPrior: number }) {
  const todayDelta = deltaUsd(kpis.todayCost, todayPrior)
  const winDelta = deltaUsd(kpis.windowCost, kpis.windowCostPriorPeriod)
  const cacheDelta = deltaPp(kpis.cacheHitPct, kpis.cacheHitPctPrior)
  const modelDelta = deltaPp(kpis.topModel?.pctOfCost ?? 0, kpis.topModelPctPrior)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Cell label="Today" value={fmtUsd(kpis.todayCost)} delta={todayDelta} sub="vs yesterday" />
      <Cell label="Window" value={fmtUsd(kpis.windowCost)} delta={winDelta} sub="vs prior period" />
      <Cell label="Cache hit" value={`${Math.round(kpis.cacheHitPct * 100)}%`} delta={cacheDelta} sub="vs prior" />
      <Cell label="Top model"
        value={kpis.topModel ? kpis.topModel.model.replace(/^claude-/, '') : '—'}
        delta={modelDelta}
        sub={kpis.topModel ? `${Math.round(kpis.topModel.pctOfCost * 100)}% of cost` : ''} />
      <Cell label="Active sessions" value={String(kpis.activeSessions.count)}
        delta={{ text: '', cls: '' }}
        sub={kpis.activeSessions.sample
          .map((s) => s.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? s.sessionId.slice(0, 6))
          .join(' · ') || 'none'} />
    </div>
  )
}

function Cell({ label, value, delta, sub }: { label: string; value: string; delta: { text: string; cls: string }; sub: string }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <div className="text-xs flex justify-between">
        {delta.text && <span className={delta.cls}>{delta.text}</span>}
        <span className="text-muted-foreground truncate">{sub}</span>
      </div>
    </div>
  )
}
