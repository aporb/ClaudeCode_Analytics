import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface ShellSnapshot {
  id: string
  capturedAt: Date
  content: string
  sourceFile: string
}

const PATTERN = /^(snapshot-zsh-(\d+)-[^.]+)\.sh$/

export async function* readShellSnapshotsDir(dir: string): AsyncGenerator<ShellSnapshot> {
  const entries = await readdir(dir)
  for (const entry of entries) {
    const m = entry.match(PATTERN)
    if (!m) continue
    const [, id, tsStr] = m
    const filePath = join(dir, entry)
    const content = await readFile(filePath, 'utf8')
    yield {
      id: id!,
      capturedAt: new Date(Number(tsStr)),
      content,
      sourceFile: filePath,
    }
  }
}
