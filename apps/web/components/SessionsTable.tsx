import { HostChip } from '@/components/HostChip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'

interface Row {
  sessionId: string
  projectPath: string | null
  startedAt: Date | null
  durationSec: number | null
  messageCount: number | null
  toolCallCount: number | null
  cost: string | null
  firstPrompt: string | null
  status: string | null
  host: string
}

export function SessionsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">no sessions match these filters.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[20px]" />
          <TableHead>when</TableHead>
          <TableHead>host</TableHead>
          <TableHead>dur</TableHead>
          <TableHead className="text-right">msgs</TableHead>
          <TableHead className="text-right">tools</TableHead>
          <TableHead className="text-right">cost</TableHead>
          <TableHead>session</TableHead>
          <TableHead>project / first prompt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.sessionId}>
            <TableCell>
              <span
                className={
                  r.status === 'active'
                    ? 'block size-2 rounded-full bg-emerald-500'
                    : 'block size-2 rounded-full bg-muted-foreground/20'
                }
              />
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {r.startedAt
                ? new Date(r.startedAt).toISOString().slice(0, 16).replace('T', ' ')
                : '—'}
            </TableCell>
            <TableCell>
              <HostChip host={r.host} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {r.durationSec ? `${Math.round(r.durationSec / 60)}m` : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.messageCount ?? 0}</TableCell>
            <TableCell className="text-right tabular-nums">{r.toolCallCount ?? 0}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.cost ? `$${Number(r.cost).toFixed(2)}` : '—'}
            </TableCell>
            <TableCell>
              <Link
                href={`/session/${r.sessionId}`}
                className="text-foreground hover:underline underline-offset-4"
              >
                {r.sessionId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground truncate max-w-[400px]">
              <span className="text-foreground/70">{r.projectPath ?? '—'}</span>
              {r.firstPrompt && (
                <span className="block truncate text-xs">
                  {r.firstPrompt.replace(/\s+/g, ' ').slice(0, 120)}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
