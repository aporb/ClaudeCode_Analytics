'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Row { project: string; cost: number }

export function CostByProject({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 140 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="project" stroke="hsl(var(--muted-foreground))" fontSize={10} width={130} />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
          formatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Bar dataKey="cost" fill="#059669" />
      </BarChart>
    </ResponsiveContainer>
  )
}
