'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Row { tool: string; calls: number; errors: number; errorRate: number }

export function TopTools({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 70 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
        <YAxis type="category" dataKey="tool" stroke="hsl(var(--muted-foreground))" fontSize={11} width={60} />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
          formatter={(v: number, k: string) => [v.toLocaleString(), k]}
        />
        <Bar dataKey="calls" fill="#0284c7" name="calls" />
        <Bar dataKey="errors" fill="#dc2626" name="errors" />
      </BarChart>
    </ResponsiveContainer>
  )
}
