import { readJsonlLines } from '@cca/parsers'

export interface DeltaLine {
  value: unknown
  byteOffset: number
  raw: string
  error?: Error
}

export async function* readDelta(
  file: string,
  startOffset: number,
): AsyncGenerator<DeltaLine> {
  for await (const item of readJsonlLines(file, { startOffset })) {
    yield {
      value: item.value,
      raw: item.raw,
      byteOffset: item.byteOffset,
      ...(item.error !== undefined ? { error: item.error } : {}),
    }
  }
}
