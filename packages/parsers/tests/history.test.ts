import { describe, it, expect } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readHistory } from '../src/history.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(__dirname, 'fixtures/history.jsonl')

describe('history parser', () => {
  it('parses prompt history entries', async () => {
    const entries = []
    for await (const e of readHistory(FIXTURE)) entries.push(e)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.display).toBe('/init ')
    expect(entries[0]?.projectPath).toBe('/Users/x/proj-a')
    expect(entries[0]?.typedAt.getTime()).toBe(1759454862042)
  })
})
