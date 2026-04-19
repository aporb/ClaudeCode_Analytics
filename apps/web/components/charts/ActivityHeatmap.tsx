import { cn } from '@/lib/utils'

interface Day { day: string; sessions: number }

export function ActivityHeatmap({ data }: { data: Day[] }) {
  const byDay = new Map(data.map((d) => [d.day, d.sessions]))
  const max = Math.max(1, ...data.map((d) => d.sessions))

  const days: Array<{ day: string; count: number }> = []
  const today = new Date()
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const iso = d.toISOString().slice(0, 10)
    days.push({ day: iso, count: byDay.get(iso) ?? 0 })
  }

  const intensity = (n: number): string => {
    if (n === 0) return 'bg-muted/40'
    const q = n / max
    if (q < 0.25) return 'bg-emerald-200 dark:bg-emerald-950'
    if (q < 0.5) return 'bg-emerald-400 dark:bg-emerald-800'
    if (q < 0.75) return 'bg-emerald-600 dark:bg-emerald-600'
    return 'bg-emerald-700 dark:bg-emerald-400'
  }

  const weekdayRows: Array<Array<{ day: string; count: number } | null>> = Array.from({ length: 7 }, () => [])
  const firstDate = new Date(days[0]!.day + 'T00:00:00Z')
  const firstDow = firstDate.getUTCDay()
  for (let r = 0; r < firstDow; r++) weekdayRows[r]!.push(null)
  for (const d of days) {
    const dow = new Date(d.day + 'T00:00:00Z').getUTCDay()
    weekdayRows[dow]!.push(d)
    for (let r = 0; r < 7; r++) {
      if (r !== dow && weekdayRows[r]!.length < weekdayRows[dow]!.length - 1) {
        weekdayRows[r]!.push(null)
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {weekdayRows.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((cell, ci) =>
            cell == null
              ? <div key={ci} className="size-3" />
              : <div
                  key={ci}
                  className={cn('size-3 rounded-sm', intensity(cell.count))}
                  title={`${cell.day}: ${cell.count} sessions`}
                />,
          )}
        </div>
      ))}
    </div>
  )
}
