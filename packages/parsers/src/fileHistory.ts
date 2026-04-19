import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface FileSnapshot {
  sessionId: string
  filePath: string        // the hash key from CC (we don't recover original name here)
  version: number
  snapshotAt: Date
  content: string | null  // null if binary
  sha256: string
  sourceFile: string
}

const VERSION_RE = /^(.+)@v(\d+)$/

export async function* readFileHistoryDir(root: string): AsyncGenerator<FileSnapshot> {
  const sessions = await readdir(root, { withFileTypes: true })
  for (const sessDir of sessions) {
    if (!sessDir.isDirectory()) continue
    const sessionId = sessDir.name
    const full = join(root, sessionId)
    const entries = await readdir(full)
    for (const entry of entries) {
      const m = entry.match(VERSION_RE)
      if (!m) continue
      const [, hashKey, vStr] = m
      const path = join(full, entry)
      const stats = await stat(path)
      const buf = await readFile(path)
      const sha256 = createHash('sha256').update(buf).digest('hex')
      const asString = buf.toString('utf8')
      // crude binary detection: null bytes = binary
      const isBinary = buf.includes(0)
      yield {
        sessionId,
        filePath: hashKey!,
        version: Number(vStr),
        snapshotAt: stats.mtime,
        content: isBinary ? null : asString,
        sha256,
        sourceFile: path,
      }
    }
  }
}
