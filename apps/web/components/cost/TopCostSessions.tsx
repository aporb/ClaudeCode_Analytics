import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface Row {
  sessionId: string
  projectPath: string | null
  startedAt: string
  durationSec: number
  messageCount: number
  modelsUsed: string[]
  cost: number
}

function shortProject(p: string | null): string {
  if (!p) return '(none)'
  return p.replace(/^\/Users\/[^/]+\//, '~/')
}

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet'))
    return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku'))
    return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export function TopCostSessions({ rows }: { rows: Row[] }) {
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Top-cost sessions
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-muted-foreground">No sessions in window.</div>
      )}
      {rows.map((r) => (
        <Link
          key={r.sessionId}
          href={`/session/${r.sessionId}`}
          className="flex justify-between py-1.5 border-b border-border last:border-0 hover:bg-muted/30"
        >
          <div className="text-sm flex flex-col">
            <span className="font-medium">{shortProject(r.projectPath)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.startedAt).toLocaleString()} · {r.messageCount} msgs ·{' '}
              {r.modelsUsed.map((m) => (
                <Badge key={m} variant="outline" className={`mr-1 ${modelChipClass(m)}`}>
                  {m.replace(/^claude-/, '').replace(/-\d+$/, '')}
                </Badge>
              ))}
            </span>
          </div>
          <div className="font-bold">${r.cost.toFixed(2)}</div>
        </Link>
      ))}
    </div>
  )
}
