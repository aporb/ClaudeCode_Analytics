import { describe, it, expect } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileHistoryDir } from '../src/fileHistory.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, 'fixtures/file-history')

describe('file-history parser', () => {
  it('reads versioned snapshots and computes sha256', async () => {
    const out = []
    for await (const s of readFileHistoryDir(ROOT)) out.push(s)
    expect(out).toHaveLength(2)
    expect(out.map((s) => s.version).sort()).toEqual([1, 2])
    expect(out.every((s) => s.sessionId === 'session-abc')).toBe(true)
    expect(out.every((s) => typeof s.sha256 === 'string' && s.sha256.length === 64)).toBe(true)
  })
})
