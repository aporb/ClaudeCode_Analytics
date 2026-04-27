import { describe, expect, it } from 'vitest'
import { parseRemotesConfig } from '../src/sync/config.js'

describe('parseRemotesConfig', () => {
  it('parses a valid registry', () => {
    const out = parseRemotesConfig(
      JSON.stringify([
        { host: 'hostinger', ssh: 'ssh_hostinger', claudeHome: '~/.claude' },
        { host: 'picoclaw', ssh: 'ssh_picoclaw' },
      ]),
    )
    expect(out).toEqual([
      { host: 'hostinger', ssh: 'ssh_hostinger', claudeHome: '~/.claude' },
      { host: 'picoclaw', ssh: 'ssh_picoclaw', claudeHome: '~/.claude' },
    ])
  })

  it('rejects host with path-traversal characters', () => {
    expect(() => parseRemotesConfig(JSON.stringify([{ host: '../foo', ssh: 'ssh_x' }]))).toThrow(
      /host.*invalid/i,
    )
  })

  it('rejects reserved host "local"', () => {
    expect(() => parseRemotesConfig(JSON.stringify([{ host: 'local', ssh: 'ssh_x' }]))).toThrow(
      /reserved/i,
    )
  })

  it('rejects duplicate host labels', () => {
    expect(() =>
      parseRemotesConfig(
        JSON.stringify([
          { host: 'a', ssh: 'ssh_a' },
          { host: 'a', ssh: 'ssh_b' },
        ]),
      ),
    ).toThrow(/duplicate/i)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseRemotesConfig('{not json')).toThrow()
  })

  it('rejects empty ssh', () => {
    expect(() => parseRemotesConfig(JSON.stringify([{ host: 'a', ssh: '' }]))).toThrow()
  })
})
