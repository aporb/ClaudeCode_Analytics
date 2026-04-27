'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export function LatencyPercentiles({
  rows,
}: { rows: { day: string; p50Sec: number; p95Sec: number }[] }) {
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Prompt → response latency
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)}s`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="p50Sec"
              stroke="hsl(var(--model-haiku))"
              name="P50"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="p95Sec"
              stroke="hsl(var(--model-opus))"
              name="P95"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
