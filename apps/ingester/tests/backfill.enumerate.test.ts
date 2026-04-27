import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enumerateSources } from '../src/backfill/enumerate.js'

describe('enumerate sources', () => {
  it('finds transcripts (including subagents), history, todos, file-history, shell-snapshots', () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-'))
    mkdirSync(join(root, 'projects/-x'), { recursive: true })
    mkdirSync(join(root, 'projects/-x/sid/subagents'), { recursive: true })
    mkdirSync(join(root, 'todos'), { recursive: true })
    mkdirSync(join(root, 'file-history/sess'), { recursive: true })
    mkdirSync(join(root, 'shell-snapshots'), { recursive: true })
    writeFileSync(join(root, 'projects/-x/session.jsonl'), '')
    writeFileSync(join(root, 'projects/-x/sid/subagents/agent-a.jsonl'), '')
    writeFileSync(join(root, 'history.jsonl'), '')
    writeFileSync(join(root, 'todos/a-agent-b.json'), '[]')
    writeFileSync(join(root, 'file-history/sess/hash@v1'), 'content')
    writeFileSync(join(root, 'shell-snapshots/snapshot-zsh-1-x.sh'), '')

    const s = enumerateSources(root)
    expect(s.transcripts).toHaveLength(2)
    expect(s.transcripts.some((p) => p.endsWith('agent-a.jsonl'))).toBe(true)
    expect(s.history).toBe(join(root, 'history.jsonl'))
    expect(s.todosDir).toBe(join(root, 'todos'))
    expect(s.fileHistoryDir).toBe(join(root, 'file-history'))
    expect(s.shellSnapshotsDir).toBe(join(root, 'shell-snapshots'))
  })
})
