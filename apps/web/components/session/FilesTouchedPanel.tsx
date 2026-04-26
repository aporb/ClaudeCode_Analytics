export function FilesTouchedPanel({ data }: { data: { top: { file: string; n: number }[]; total: number } }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Files touched</div>
      {data.top.length === 0 && <div className="text-sm text-muted-foreground">No files touched.</div>}
      {data.top.map((r) => (
        <div key={r.file} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
          <span className="truncate">{r.file.replace(/^\/Users\/[^/]+\//, '~/')}</span>
          <span>{r.n}×</span>
        </div>
      ))}
      {data.total > data.top.length && (
        <div className="pt-1 text-xs text-muted-foreground">+ {data.total - data.top.length} more</div>
      )}
    </div>
  )
}
