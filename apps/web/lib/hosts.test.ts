import { describe, expect, it } from 'vitest'
import { parseHosts } from './hosts'

describe('parseHosts', () => {
  it('returns null when no param/cookie is set (means: all hosts)', () => {
    expect(parseHosts({ searchParams: {}, cookieValue: null })).toBeNull()
  })
  it('parses single host', () => {
    expect(parseHosts({ searchParams: { host: 'hostinger' }, cookieValue: null })).toEqual(['hostinger'])
  })
  it('parses comma-separated hosts', () => {
    expect(parseHosts({ searchParams: { host: 'hostinger,local' }, cookieValue: null })).toEqual(['hostinger', 'local'])
  })
  it('falls back to cookie when no URL param', () => {
    expect(parseHosts({ searchParams: {}, cookieValue: 'picoclaw' })).toEqual(['picoclaw'])
  })
  it('URL wins over cookie', () => {
    expect(parseHosts({ searchParams: { host: 'a' }, cookieValue: 'b' })).toEqual(['a'])
  })
})
