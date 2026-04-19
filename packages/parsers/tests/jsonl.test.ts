import { describe, it, expect } from 'vitest'
import { readJsonlLines } from '../src/jsonl.js'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

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

  it('strips \\u0000 null bytes from lines that contain them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-null-'))
    const file = join(root, 't.jsonl')
    // Two valid lines; the first has a literal null byte in a string value.
    // Writing via writeFileSync with escape chars in the TS source — Node handles it directly.
    writeFileSync(file, `{"a":"before\u0000after"}\n{"b":2}\n`)
    const out: unknown[] = []
    for await (const { value, error } of readJsonlLines(file)) {
      if (!error && value) out.push(value)
    }
    expect(out).toHaveLength(2)
    expect((out[0] as { a: string }).a).toBe('beforeafter')
  })

  it('strips \\\\u0000 JSON escape sequences that would produce null chars after JSON.parse', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cca-null-esc-'))
    const file = join(root, 't.jsonl')
    // Write the literal text \u0000 as a JSON escape sequence in the file.
    // Buffer.from ensures the 6 ASCII chars \u0000 land in the file, not an actual null byte.
    const line1 = Buffer.from('{"a":"hello\\u0000world"}\n')
    const line2 = Buffer.from('{"b":2}\n')
    writeFileSync(file, Buffer.concat([line1, line2]))
    const out: unknown[] = []
    for await (const { value, error } of readJsonlLines(file)) {
      if (!error && value) out.push(value)
    }
    expect(out).toHaveLength(2)
    expect((out[0] as { a: string }).a).toBe('helloworld')
  })
})
