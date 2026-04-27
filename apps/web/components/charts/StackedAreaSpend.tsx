'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Row {
  day: string
  model: string
  cost: number
}

function modelHsl(model: string): string {
  if (model.includes('opus')) return 'hsl(var(--model-opus))'
  if (model.includes('sonnet')) return 'hsl(var(--model-sonnet))'
  if (model.includes('haiku')) return 'hsl(var(--model-haiku))'
  return 'hsl(var(--muted-foreground))'
}

export function StackedAreaSpend({ rows }: { rows: Row[] }) {
  const days = Array.from(new Set(rows.map((r) => r.day))).sort()
  const models = Array.from(new Set(rows.map((r) => r.model)))
  const data = days.map((day) => {
    const o: Record<string, number | string> = { day }
    for (const m of models) {
      const r = rows.find((x) => x.day === day && x.model === m)
      o[m] = r ? Number(r.cost.toFixed(4)) : 0
    }
    return o
  })
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {models.map((m) => (
            <Area
              key={m}
              type="monotone"
              dataKey={m}
              stackId="1"
              stroke={modelHsl(m)}
              fill={modelHsl(m)}
              fillOpacity={0.6}
              name={m.replace(/^claude-/, '').replace(/-\d+$/, '')}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
