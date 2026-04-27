export function FirstPromptsStrip({ rows }: { rows: { ts: string; text: string }[] }) {
  if (rows.length === 0) return null
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        First prompts
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 py-1 border-b border-border last:border-0 text-sm">
          <span className="text-muted-foreground text-xs">
            {new Date(r.ts).toLocaleTimeString()}
          </span>
          <span className="truncate">"{r.text}"</span>
        </div>
      ))}
    </div>
  )
}
