import { describe, it, expect } from 'vitest'
import { readJsonlLines } from '../src/jsonl.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const FIXTURE = resolve(__dirname, 'fixtures/sample.jsonl')

describe('jsonl reader', () => {
  it('reads valid lines and skips malformed ones', async () => {
    const out: unknown[] = []
    const errors: Array<{ line: number; error: string }> = []
    for await (const { value, lineNumber, error } of readJsonlLines(FIXTURE)) {
      if (error) errors.push({ line: lineNumber, error: error.message })
      else out.push(value)
    }
    expect(out).toHaveLength(3)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.line).toBe(3)
  })

  it('supports starting at a byte offset', async () => {
    const fs = await import('node:fs/promises')
    const full = await fs.readFile(FIXTURE, 'utf8')
    const firstLineLen = (full.split('\n')[0]?.length ?? 0) + 1
    const out: unknown[] = []
    for await (const { value, error } of readJsonlLines(FIXTURE, { startOffset: firstLineLen })) {
      if (!error && value) out.push(value)
    }
    expect(out).toHaveLength(2) // skipped first line
  })
})
