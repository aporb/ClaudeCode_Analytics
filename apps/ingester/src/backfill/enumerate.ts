import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface Sources {
  transcripts: string[]
  history: string | null
  todosDir: string | null
  fileHistoryDir: string | null
  shellSnapshotsDir: string | null
}

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonl(full, out)
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

export function enumerateSources(claudeHome: string): Sources {
  return {
    transcripts: walkJsonl(join(claudeHome, 'projects')),
    history: existsSync(join(claudeHome, 'history.jsonl'))
      ? join(claudeHome, 'history.jsonl')
      : null,
    todosDir: existsSync(join(claudeHome, 'todos')) ? join(claudeHome, 'todos') : null,
    fileHistoryDir: existsSync(join(claudeHome, 'file-history'))
      ? join(claudeHome, 'file-history')
      : null,
    shellSnapshotsDir: existsSync(join(claudeHome, 'shell-snapshots'))
      ? join(claudeHome, 'shell-snapshots')
      : null,
  }
}
