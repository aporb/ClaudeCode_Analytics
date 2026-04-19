import { projectPathFromFile } from '@cca/core'
import type { ParsedEvent, EventType } from '@cca/core'
import { readJsonlLines } from './jsonl.js'

export function isSidechainPath(file: string): boolean {
  return /\/subagents\/agent-[^/]+\.jsonl$/.test(file)
}

export function agentIdFromPath(file: string): string | null {
  const m = file.match(/\/subagents\/agent-([^/]+)\.jsonl$/)
  return m?.[1] ?? null
}

// Discriminate subtype from the raw line.
function deriveSubtype(raw: Record<string, unknown>): string | null {
  const type = raw.type as string
  if (type === 'progress') {
    const data = raw.data as { type?: string } | undefined
    return data?.type ?? null
  }
  if (type === 'assistant') return 'assistant_message'
  if (type === 'user') {
    const msg = raw.message as { content?: unknown } | undefined
    const content = msg?.content
    if (Array.isArray(content) && content.some((c: unknown) => (c as Record<string, unknown>)?.type === 'tool_result')) {
      return 'tool_result'
    }
    return 'user_message'
  }
  if (type === 'file-history-snapshot') return 'file_snapshot'
  return null
}

export async function* readTranscript(file: string): AsyncGenerator<ParsedEvent> {
  const sidechain = isSidechainPath(file)
  const agentId = agentIdFromPath(file)
  const projectPath = projectPathFromFile(file)
  for await (const { value, error } of readJsonlLines(file)) {
    if (error || !value || typeof value !== 'object') continue
    const raw = value as Record<string, unknown>
    const uuid = raw.uuid as string | undefined
    const timestamp = raw.timestamp as string | undefined
    const type = raw.type as EventType | undefined
    if (!uuid || !timestamp || !type) continue
    yield {
      uuid,
      sessionId: (raw.sessionId as string | undefined) ?? 'unknown',
      parentUuid: (raw.parentUuid as string | null | undefined) ?? null,
      type,
      subtype: deriveSubtype(raw),
      timestamp: new Date(timestamp),
      cwd: (raw.cwd as string | undefined) ?? null,
      projectPath,
      gitBranch: (raw.gitBranch as string | undefined) ?? null,
      ccVersion: (raw.version as string | undefined) ?? null,
      entrypoint: (raw.entrypoint as string | undefined) ?? null,
      isSidechain: sidechain || Boolean(raw.isSidechain),
      agentId: agentId ?? ((raw.agentId as string | undefined) ?? null),
      requestId: (raw.requestId as string | undefined) ?? null,
      payload: raw,
      sourceFile: file,
    }
  }
}
