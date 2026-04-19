import { readJsonlLines } from './jsonl.js'

export interface HistoryEntry {
  display: string
  pastedContents: unknown
  typedAt: Date
  projectPath: string | null
}

export async function* readHistory(file: string): AsyncGenerator<HistoryEntry> {
  for await (const { value, error } of readJsonlLines(file)) {
    if (error || !value || typeof value !== 'object') continue
    const raw = value as Record<string, unknown>
    const ts = raw.timestamp as number | undefined
    const display = raw.display as string | undefined
    if (typeof ts !== 'number' || typeof display !== 'string') continue
    yield {
      display,
      pastedContents: raw.pastedContents ?? {},
      typedAt: new Date(ts),
      projectPath: (raw.project as string | undefined) ?? null,
    }
  }
}
