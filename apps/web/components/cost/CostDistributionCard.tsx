export function CostDistributionCard({
  distribution,
}: {
  distribution: { p50: number; p95: number; p99: number; max: number; count: number }
}) {
  const rows = [
    ['P50', distribution.p50],
    ['P95', distribution.p95],
    ['P99', distribution.p99],
    ['Max', distribution.max],
  ] as const
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Cost distribution
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
          <span className="text-sm text-muted-foreground">{k}</span>
          <span className="font-bold">${v.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-xs text-muted-foreground">
        <span>Sessions</span>
        <span>{distribution.count}</span>
      </div>
    </div>
  )
}
