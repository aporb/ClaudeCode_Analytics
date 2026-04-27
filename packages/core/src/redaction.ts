// Order matters: JWTs look like bearer tokens, so check JWT first.
const RULES: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'jwt', pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g },
  { kind: 'anthropic', pattern: /sk-ant-[A-Za-z0-9_\-]{20,}/g },
  { kind: 'openai', pattern: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { kind: 'aws', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'github', pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { kind: 'github', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'bearer', pattern: /Bearer\s+[A-Za-z0-9\-_\.]{20,}/g },
]

export function redact(text: string): string {
  let out = text
  for (const { kind, pattern } of RULES) {
    out = out.replaceAll(pattern, `[REDACTED:${kind}]`)
  }
  return out
}
