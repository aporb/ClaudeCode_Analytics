export interface BriefingInput {
  windowCost: number
  windowCostPriorPeriod: number
  cacheHitPct: number
  cacheHitPctPrior: number
  topProject: { project: string; model: string; cost: number } | null
  windowLabel: string
  isPartialDay: boolean
}

export interface Briefing {
  lines: string[]
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 0.01) return '$0.00'
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}%`
}

function fmtDeltaPct(curr: number, prior: number): string {
  if (!Number.isFinite(prior) || prior === 0) return '—'
  const pct = (curr - prior) / prior
  if (!Number.isFinite(pct)) return '—'
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.round(Math.abs(pct) * 100)}%`
}

function fmtDeltaPp(curr: number, prior: number): string {
  if (!Number.isFinite(prior)) return '—'
  const pp = Math.round((curr - prior) * 100)
  if (pp === 0) return 'flat'
  const sign = pp >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pp)}pp`
}

function modelDisplay(m: string): string {
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  return m
}

export function computeBriefing(i: BriefingInput): Briefing {
  const lines: string[] = []
  const noun = i.isPartialDay ? 'today so far' : i.windowLabel.toLowerCase().replace(/^last /, '')
  if (Number.isFinite(i.windowCostPriorPeriod) && i.windowCostPriorPeriod > 0) {
    lines.push(
      `Burn ${fmtUsd(i.windowCost)} ${noun}, ${fmtDeltaPct(i.windowCost, i.windowCostPriorPeriod)} vs prior period.`,
    )
  } else if (!Number.isFinite(i.windowCostPriorPeriod)) {
    lines.push(`Burn ${fmtUsd(i.windowCost)} ${noun} (vs prior: —).`)
  } else {
    lines.push(`Burn ${fmtUsd(i.windowCost)} ${noun}.`)
  }
  if (i.topProject) {
    lines.push(
      `Largest contributor: ${i.topProject.project} on ${modelDisplay(i.topProject.model)} (${fmtUsd(i.topProject.cost)}).`,
    )
  }
  lines.push(
    `Cache hit ${fmtPct(i.cacheHitPct)} (${fmtDeltaPp(i.cacheHitPct, i.cacheHitPctPrior)} from prior).`,
  )
  return { lines }
}

export function renderBriefing(b: Briefing): string {
  return b.lines.join('\n')
}
