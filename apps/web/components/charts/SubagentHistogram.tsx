'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function SubagentHistogram({ rows }: { rows: { bucket: number; count: number }[] }) {
  const data = Array.from({ length: 7 }, (_, i) => ({
    bucket: i === 6 ? '6+' : String(i),
    count: rows.find((r) => r.bucket === i)?.count ?? 0,
  }))
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Subagent depth</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--model-opus))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
