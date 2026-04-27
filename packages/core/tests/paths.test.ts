import { describe, it, expect } from 'vitest'
import { flatToRealPath, realToFlatPath, projectPathFromFile } from '../src/paths.js'

describe('paths', () => {
  // flat → real: component boundaries with '_' round-trip; internal '_' and '-' are lossy.
  it('converts unambiguous flat CC path back to real filesystem path', () => {
    // '-Users-someuser-projects-myapp' has NO '--' and no ambiguity.
    expect(flatToRealPath('-Users-someuser-projects-myapp'))
      .toBe('/Users/someuser/projects/myapp')
  })

  it('handles "--" in flat path decoding to "_" (mid-component, not boundary)', () => {
    // '-x--foo-y': strip '-' → 'x--foo-y', replace '--'→'\0' → 'x\0foo-y',
    // replace '-'→'/' → 'x\0foo/y', replace '\0'→'_' → 'x_foo/y', prepend '/' → '/x_foo/y'.
    // The '--' decodes to '_' in the middle of a component, not at a path separator boundary.
    // Note: the flat form of '/x/_foo/y' is actually '-x---foo-y' (not '-x--foo-y').
    expect(flatToRealPath('-x--foo-y')).toBe('/x_foo/y')
  })

  it('documents lossy case: "-" inside a dirname reads as "/"', () => {
    // Original '/Users/a/ClaudeCode-Analytics' encodes to '-Users-a-ClaudeCode-Analytics'
    // — inversion can't distinguish the intended '-' from a '/', so we read as '/'.
    expect(flatToRealPath('-Users-a-ClaudeCode-Analytics'))
      .toBe('/Users/a/ClaudeCode/Analytics')
  })

  it('round-trips a real path with no "-" and component-boundary "_" only', () => {
    const real = '/Users/someuser/projects/myapp'
    expect(flatToRealPath(realToFlatPath(real))).toBe(real)
  })

  it('documents lossy round-trip: "_" after "/" does not survive', () => {
    // realToFlatPath('/Users/someuser/Documents/_Projects/myapp'):
    //   '_' → '--' gives 'Users/someuser/Documents/--Projects/myapp'
    //   '/' → '-' gives 'Users-someuser-Documents---Projects-myapp'
    //   prepend '-' → '-Users-someuser-Documents---Projects-myapp'
    // flatToRealPath of that: strip '-' → 'Users-someuser-Documents---Projects-myapp'
    //   '---' contains '--' at pos 0 → '\0-' (left-to-right non-overlapping)
    //   '-'→'/' → '\0/' then '\0'→'_' → '_/'
    //   result: '/Users/someuser/Documents_/Projects/myapp'  ← '_' and '/' swapped!
    // This is a lossy case in the algorithm; the test documents actual behavior.
    const real = '/Users/someuser/Documents/_Projects/myapp'
    expect(flatToRealPath(realToFlatPath(real))).toBe('/Users/someuser/Documents_/Projects/myapp')
  })

  it('extracts project path from a full transcript file path', () => {
    const f = '/Users/someuser/.claude/projects/-Users-someuser-projects-myapp/abc.jsonl'
    expect(projectPathFromFile(f)).toBe('/Users/someuser/projects/myapp')
  })

  it('extracts project path for subagent file', () => {
    const f = '/Users/someuser/.claude/projects/-Users-someuser-projects-foo/session123/subagents/agent-abc.jsonl'
    expect(projectPathFromFile(f)).toBe('/Users/someuser/projects/foo')
  })

  it('returns null when file is not under .claude/projects', () => {
    expect(projectPathFromFile('/tmp/random.jsonl')).toBeNull()
  })
})
