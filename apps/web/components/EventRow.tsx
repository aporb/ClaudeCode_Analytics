import { cn } from '@/lib/utils'

interface EventLike {
  uuid: string
  type: string
  subtype: string | null
  timestamp: Date
  isSidechain: boolean
  payload: unknown
}

function hhmmss(ts: Date): string {
  return new Date(ts).toISOString().slice(11, 19)
}

function extractPreview(payload: unknown): { kind: string; text: string } {
  const msg = (payload as { message?: { content?: unknown } }).message
  const content = msg?.content
  if (typeof content === 'string') return { kind: 'text', text: content }
  if (Array.isArray(content)) {
    for (const block of content as Array<{ type: string; text?: string; input?: unknown; content?: unknown; name?: string }>) {
      if (block?.type === 'text' && typeof block.text === 'string') return { kind: 'text', text: block.text }
      if (block?.type === 'thinking' && typeof block.text === 'string') return { kind: 'thinking', text: block.text }
      if (block?.type === 'tool_use') return { kind: 'tool_use', text: `${block.name ?? '?'}(${JSON.stringify(block.input).slice(0, 200)})` }
      if (block?.type === 'tool_result') {
        const body = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
        return { kind: 'tool_result', text: String(body ?? '').slice(0, 300) }
      }
    }
  }
  return { kind: 'other', text: '' }
}

const kindStyle: Record<string, string> = {
  text: 'text-foreground',
  thinking: 'text-muted-foreground italic',
  tool_use: 'text-amber-700 dark:text-amber-400',
  tool_result: 'text-violet-700 dark:text-violet-400',
  other: 'text-muted-foreground',
}

export function EventRow({ event }: { event: EventLike }) {
  const { kind, text } = extractPreview(event.payload)
  const label = `${event.type}/${event.subtype ?? '-'}`
  return (
    <div
      id={event.uuid}
      className={cn(
        'grid grid-cols-[80px_200px_1fr] gap-4 py-1 text-xs hover:bg-muted/30 rounded px-2',
        event.isSidechain && 'border-l-2 border-amber-500/60 pl-2 bg-amber-50/30 dark:bg-amber-950/20',
      )}
    >
      <span className="text-muted-foreground tabular-nums">{hhmmss(event.timestamp)}</span>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={cn('whitespace-pre-wrap break-words', kindStyle[kind])}>
        {text.replace(/\s+/g, ' ').slice(0, 500)}
      </span>
    </div>
  )
}
