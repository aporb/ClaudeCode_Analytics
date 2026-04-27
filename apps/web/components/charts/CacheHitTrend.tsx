'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export function CacheHitTrend({ rows }: { rows: { day: string; hitPct: number }[] }) {
  const data = rows.map((r) => ({ day: r.day, pct: Math.round(r.hitPct * 100) }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Cache hit rate · daily
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="hsl(var(--model-haiku))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
