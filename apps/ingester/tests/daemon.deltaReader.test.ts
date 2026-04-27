import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDelta } from '../src/daemon/deltaReader.js'

describe('readDelta', () => {
  it('reads lines added since the given byte offset', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-delta-'))
    const file = join(root, 't.jsonl')
    writeFileSync(file, '{"a":1}\n{"a":2}\n')
    const initialOffset = Buffer.byteLength('{"a":1}\n', 'utf8')
    appendFileSync(file, '{"a":3}\n')
    const out: unknown[] = []
    for await (const { value } of readDelta(file, initialOffset)) out.push(value)
    expect(out).toEqual([{ a: 2 }, { a: 3 }])
  })

  it('returns nothing when offset is at EOF', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-delta-'))
    const file = join(root, 't.jsonl')
    writeFileSync(file, '{"a":1}\n')
    const eof = Buffer.byteLength('{"a":1}\n', 'utf8')
    const out: unknown[] = []
    for await (const { value } of readDelta(file, eof)) out.push(value)
    expect(out).toHaveLength(0)
  })
})
