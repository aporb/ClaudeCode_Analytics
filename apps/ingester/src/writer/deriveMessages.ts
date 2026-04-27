import type { ParsedEvent } from '@cca/core'
import { messages } from '@cca/db'
import type * as schema from '@cca/db/schema'
import { inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

type Db = PostgresJsDatabase<typeof schema>

interface FlatBlock {
  type: string
  text?: string
  content?: unknown
}

function flattenTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content as FlatBlock[]) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block?.type === 'tool_result') {
      if (typeof block.content === 'string') parts.push(block.content)
      else if (Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (typeof (inner as FlatBlock).text === 'string') parts.push((inner as FlatBlock).text!)
        }
      }
    }
  }
  return parts.join('\n')
}

export async function deriveMessagesFromEvents(
  db: Db,
  batch: ParsedEvent[],
  opts: { host: string },
): Promise<number> {
  const rows: Array<typeof messages.$inferInsert> = []
  for (const e of batch) {
    if (e.type !== 'assistant' && e.type !== 'user') continue
    const payload = e.payload as {
      message?: {
        role?: string
        content?: unknown
        model?: string
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
        }
      }
    }
    const msg = payload.message
    if (!msg) continue
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const text = flattenTextContent(msg.content)
    rows.push({
      uuid: e.uuid,
      sessionId: e.sessionId,
      role,
      timestamp: e.timestamp,
      model: msg.model ?? null,
      textContent: text,
      inputTokens: msg.usage?.input_tokens ?? null,
      outputTokens: msg.usage?.output_tokens ?? null,
      cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? null,
      cacheReadTokens: msg.usage?.cache_read_input_tokens ?? null,
      isSidechain: e.isSidechain,
      host: opts.host,
    })
  }
  if (rows.length === 0) return 0
  const result = await db
    .insert(messages)
    .values(rows)
    .onConflictDoNothing({ target: messages.uuid })
    .returning({ uuid: messages.uuid })

  // Populate text_tsv in one UPDATE (cheaper than per-row)
  const insertedUuids = result.map((r) => r.uuid)
  if (insertedUuids.length > 0) {
    await db
      .update(messages)
      .set({ textTsv: sql`to_tsvector('english', coalesce(${messages.textContent}, ''))` })
      .where(inArray(messages.uuid, insertedUuids))
  }
  return result.length
}
