import { describe, expect, it } from 'vitest'
import { redact } from '../src/redaction.js'

describe('redaction', () => {
  it('redacts Anthropic API keys', () => {
    const input = 'My key is sk-ant-api03-abcDEF123_xyz456-ghi'
    expect(redact(input)).toContain('[REDACTED:anthropic]')
    expect(redact(input)).not.toContain('sk-ant-api03-abcDEF')
  })

  it('redacts AWS access key ids', () => {
    expect(redact('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED:aws]')
  })

  it('redacts GitHub PATs', () => {
    expect(redact('token ghp_1234567890abcdefghij1234567890abcdefgh')).toContain(
      '[REDACTED:github]',
    )
  })

  it('redacts bearer tokens', () => {
    expect(redact('Authorization: Bearer eyJabc.eyJdef.ghi1234567890xxxxxxxxxx')).toContain(
      '[REDACTED:jwt]',
    )
  })

  it('leaves clean text alone', () => {
    const clean = 'just a regular sentence with numbers 12345'
    expect(redact(clean)).toBe(clean)
  })
})
