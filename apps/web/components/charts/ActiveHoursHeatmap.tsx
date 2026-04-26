const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ActiveHoursHeatmap({ data }: { data: { cells: number[]; clamped: boolean } }) {
  const max = Math.max(1, ...data.cells)
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Active hours {data.clamped && <span className="opacity-70">(clamped to 30d)</span>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `auto repeat(24, 1fr)`, gap: 2 }}>
        <div></div>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[8px] text-center text-muted-foreground">{h % 6 === 0 ? h : ''}</div>
        ))}
        {DOWS.map((dow, dowIdx) => (
          <div key={dow} className="contents">
            <div className="text-[10px] text-muted-foreground pr-1 self-center">{dow}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const v = data.cells[dowIdx * 24 + h] ?? 0
              const intensity = v / max
              return (
                <div key={h} title={`${dow} ${h}:00 — ${v} sessions`}
                  className="rounded-sm"
                  style={{
                    background: `hsl(var(--model-sonnet) / ${0.08 + intensity * 0.85})`,
                    aspectRatio: '1',
                  }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
