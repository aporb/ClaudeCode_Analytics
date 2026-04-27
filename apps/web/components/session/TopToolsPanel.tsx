import { Badge } from '@/components/ui/badge'

export function TopToolsPanel({
  rows,
}: { rows: { tool: string; calls: number; errors: number }[] }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Top tools</div>
      {rows.length === 0 && <div className="text-sm text-muted-foreground">No tool calls.</div>}
      {rows.map((r) => (
        <div
          key={r.tool}
          className="flex justify-between py-1 border-b border-border last:border-0 text-sm"
        >
          <span>
            {r.tool}
            {r.errors > 0 && (
              <Badge variant="outline" className="ml-2 border-red-500 text-red-500">
                {r.errors} err
              </Badge>
            )}
          </span>
          <span className="font-bold">{r.calls}</span>
        </div>
      ))}
    </div>
  )
}
