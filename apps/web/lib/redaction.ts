import { redact as coreRedact } from '@cca/core/redaction'

export function applyRedaction(text: string, raw: boolean): string {
  return raw ? text : coreRedact(text)
}

export function applyRedactionDeep(value: unknown, raw: boolean): unknown {
  if (raw) return value
  if (typeof value === 'string') return coreRedact(value)
  if (Array.isArray(value)) return value.map((v) => applyRedactionDeep(v, raw))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = applyRedactionDeep(v, raw)
    return out
  }
  return value
}
