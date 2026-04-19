import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface TodoSnapshot {
  sessionId: string
  agentId: string
  snapshotAt: Date
  todos: unknown
  sourceFile: string
}

// Filenames look like: <sessionId>-agent-<agentId>.json
const PATTERN = /^([a-zA-Z0-9\-]+)-agent-([^.]+)\.json$/

export async function* readTodosDir(dir: string): AsyncGenerator<TodoSnapshot> {
  const entries = await readdir(dir)
  for (const entry of entries) {
    const m = entry.match(PATTERN)
    if (!m) continue
    const [, sessionId, agentId] = m
    const filePath = join(dir, entry)
    const stats = await stat(filePath)
    const body = await readFile(filePath, 'utf8')
    try {
      const todos = JSON.parse(body) as unknown
      yield {
        sessionId: sessionId!,
        agentId: agentId!,
        snapshotAt: stats.mtime,
        todos,
        sourceFile: filePath,
      }
    } catch {
      // skip malformed
    }
  }
}
