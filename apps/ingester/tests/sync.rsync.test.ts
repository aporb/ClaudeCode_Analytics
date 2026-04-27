import { describe, expect, it } from 'vitest'
import { detectRsyncVersion, parseRsyncStats } from '../src/sync/rsync.js'

describe('detectRsyncVersion', () => {
  it('parses rsync 3.2.7', () => {
    expect(detectRsyncVersion('rsync  version 3.2.7  protocol version 31\n...')).toEqual({
      major: 3,
      minor: 2,
    })
  })
  it('parses rsync 2.6.9 (macOS)', () => {
    expect(detectRsyncVersion('rsync  version 2.6.9  protocol version 29\n...')).toEqual({
      major: 2,
      minor: 6,
    })
  })
})

describe('parseRsyncStats — version 3.x with --info=stats2', () => {
  const STATS2_OUTPUT = `
Number of files: 1,234 (reg: 1,000, dir: 234)
Number of created files: 5
Number of deleted files: 0
Number of regular files transferred: 7
Total file size: 12,345,678 bytes
Total transferred file size: 5,432 bytes
`
  it('extracts files-transferred', () => {
    expect(parseRsyncStats(STATS2_OUTPUT, { major: 3, minor: 2 })).toEqual({
      filesTransferred: 7,
      bytesTransferred: 5432,
    })
  })
})

describe('parseRsyncStats — version 2.6.9 fallback (--itemize-changes line count)', () => {
  it('counts non-empty itemize lines', () => {
    const out = '>f+++++++++ projects/foo.jsonl\n>f.st...... projects/bar.jsonl\n'
    expect(parseRsyncStats(out, { major: 2, minor: 6 })).toEqual({
      filesTransferred: 2,
      bytesTransferred: 0,
    })
  })
})

describe('parseRsyncStats — both fail', () => {
  it('returns "unknown" outcome (treated as non-empty by caller)', () => {
    expect(parseRsyncStats('', { major: 3, minor: 0 })).toEqual({
      filesTransferred: null,
      bytesTransferred: null,
    })
  })
})
