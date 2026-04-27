export function StatsStrip({
  cost,
  messages,
  toolCalls,
  toolErrors,
  cacheHitPct,
  subagents,
}: {
  cost: number
  messages: number
  toolCalls: number
  toolErrors: number
  cacheHitPct: number
  subagents: number
}) {
  const cells = [
    ['Cost', `$${cost.toFixed(2)}`],
    ['Messages', String(messages)],
    ['Tool calls', String(toolCalls)],
    ['Tool errors', String(toolErrors)],
    ['Cache hit', `${Math.round(cacheHitPct * 100)}%`],
    ['Subagents', String(subagents)],
  ] as const
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cells.map(([label, value]) => (
        <div key={label} className="border border-border rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      ))}
    </div>
  )
}
