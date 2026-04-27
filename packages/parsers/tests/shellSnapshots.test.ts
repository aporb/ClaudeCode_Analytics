import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readShellSnapshotsDir } from '../src/shellSnapshots.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(__dirname, 'fixtures/shell-snapshots')

describe('shell snapshots parser', () => {
  it('parses snapshots with id and timestamp from filename', async () => {
    const out = []
    for await (const s of readShellSnapshotsDir(DIR)) out.push(s)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('snapshot-zsh-1752714645586-8gx82k')
    expect(out[0]?.capturedAt.getTime()).toBe(1752714645586)
    expect(out[0]?.content).toContain('export PATH')
  })
})
