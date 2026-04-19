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
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let lineNumber = 0
  let byteOffset = opts.startOffset ?? 0
  for await (const line of rl) {
    lineNumber += 1
    const byteLength = Buffer.byteLength(line, 'utf8') + 1 // + newline
    byteOffset += byteLength
    if (line.length === 0) continue
    try {
      const value = JSON.parse(line)
      yield { value, raw: line, lineNumber, byteOffset }
    } catch (e) {
      yield { value: null, raw: line, lineNumber, byteOffset, error: e as Error }
    }
  }
}
