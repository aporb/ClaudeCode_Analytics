import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { toolCalls } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { ParsedEvent } from '@cca/core'

type Db = PostgresJsDatabase<typeof schema>

interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: unknown }
interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }

function extractToolUses(e: ParsedEvent): Array<ToolUseBlock & { parentMessageUuid: string }> {
  if (e.type !== 'assistant') return []
  const msg = (e.payload as { message?: { content?: unknown } }).message
  const content = msg?.content
  if (!Array.isArray(content)) return []
  return content
    .filter((b: any): b is ToolUseBlock => b?.type === 'tool_use')
    .map((b) => ({ ...b, parentMessageUuid: e.uuid }))
}

function extractToolResults(e: ParsedEvent): ToolResultBlock[] {
  if (e.type !== 'user') return []
  const msg = (e.payload as { message?: { content?: unknown } }).message
  const content = msg?.content
  if (!Array.isArray(content)) return []
  return content.filter((b: any): b is ToolResultBlock => b?.type === 'tool_result')
}

export async function deriveToolCallsFromEvents(db: Db, batch: ParsedEvent[]): Promise<number> {
  // Index results by tool_use_id within the batch — sufficient for streaming since tool results
  // appear in the SAME file, close to their tool_use event.
  const resultIndex = new Map<string, { event: ParsedEvent; block: ToolResultBlock }>()
  for (const e of batch) {
    for (const r of extractToolResults(e)) resultIndex.set(r.tool_use_id, { event: e, block: r })
  }

  const rows: Array<typeof toolCalls.$inferInsert> = []
  for (const e of batch) {
    for (const use of extractToolUses(e)) {
      const pair = resultIndex.get(use.id)
      const durationMs = pair
        ? Math.max(0, pair.event.timestamp.getTime() - e.timestamp.getTime())
        : null
      rows.push({
        uuid: e.uuid,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        toolName: use.name,
        input: use.input as object,
        result: (pair?.block.content as object | undefined) ?? null,
        resultUuid: pair?.event.uuid ?? null,
        durationMs,
        isError: pair?.block.is_error ?? null,
        parentMessageUuid: use.parentMessageUuid,
      })
    }
  }
  if (rows.length === 0) return 0
  const result = await db
    .insert(toolCalls)
    .values(rows)
    .onConflictDoNothing({ target: toolCalls.uuid })
    .returning({ uuid: toolCalls.uuid })
  return result.length
}
