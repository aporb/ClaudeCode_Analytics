'use client'

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function TokenVelocityScatter({ rows }: { rows: { startedAt: string; tokensPerSec: number; cost: number | null }[] }) {
  const data = rows.map((r) => ({
    x: new Date(r.startedAt).getTime(),
    y: r.tokensPerSec,
    cost: r.cost ?? 0,
  }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Token velocity</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{ fontSize: 10 }}
              tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)} />
            <YAxis dataKey="y" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v)}t/s`} />
            <Tooltip formatter={(v: number) => `${v.toFixed(2)} t/s`} />
            <Scatter data={data} fill="hsl(var(--model-sonnet))" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
