import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface JsonlLineResult {
  value: unknown
  raw: string
  lineNumber: number
  byteOffset: number
  error?: Error
}

export interface ReadOptions {
  startOffset?: number
}

export async function* readJsonlLines(
  path: string,
  opts: ReadOptions = {},
): AsyncGenerator<JsonlLineResult> {
  const stream = createReadStream(path, {
    encoding: 'utf8',
    start: opts.startOffset ?? 0,
  })
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })
  let lineNumber = 0
  let byteOffset = opts.startOffset ?? 0
  for await (const line of rl) {
    lineNumber += 1
    const byteLength = Buffer.byteLength(line, 'utf8') + 1 // + newline
    byteOffset += byteLength
    if (line.length === 0) continue
    // Strip null bytes — Postgres JSONB rejects U+0000. Two forms appear in real data:
    //  1. Literal 0x00 bytes in the raw file (actual null byte in the line string)
    //  2. The JSON escape sequence \u0000, which JSON.parse would decode into U+0000
    // We strip both before parsing so neither form ever reaches the DB.
    // Seen in ~12 files in real CC transcripts; null bytes are never meaningful content.
    const sanitized =
      line.includes('\u0000') || line.includes('\\u0000')
        ? line.replaceAll('\u0000', '').replaceAll('\\u0000', '')
        : line
    try {
      const value = JSON.parse(sanitized)
      yield { value, raw: line, lineNumber, byteOffset }
    } catch (e) {
      yield { value: null, raw: line, lineNumber, byteOffset, error: e as Error }
    }
  }
}
