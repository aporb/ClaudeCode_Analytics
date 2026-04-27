import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withHostLock } from '../src/sync/lock.js'

const createdDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cca-lock-'))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()!
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

describe('withHostLock — serializes concurrent invocations on the same mirror dir', () => {
  it('second caller waits until the first releases', async () => {
    const mirrorDir = makeTempDir()
    const events: { who: 'A' | 'B'; phase: 'start' | 'end'; t: number }[] = []
    const HOLD_MS = 200

    const a = withHostLock(mirrorDir, async () => {
      events.push({ who: 'A', phase: 'start', t: Date.now() })
      await new Promise((r) => setTimeout(r, HOLD_MS))
      events.push({ who: 'A', phase: 'end', t: Date.now() })
    })

    // Tiny stagger so A wins the race deterministically.
    await new Promise((r) => setTimeout(r, 20))

    const b = withHostLock(mirrorDir, async () => {
      events.push({ who: 'B', phase: 'start', t: Date.now() })
      await new Promise((r) => setTimeout(r, 20))
      events.push({ who: 'B', phase: 'end', t: Date.now() })
    })

    await Promise.all([a, b])

    expect(events.map((e) => `${e.who}:${e.phase}`)).toEqual([
      'A:start',
      'A:end',
      'B:start',
      'B:end',
    ])
    const aEnd = events.find((e) => e.who === 'A' && e.phase === 'end')!.t
    const bStart = events.find((e) => e.who === 'B' && e.phase === 'start')!.t
    // Allow a small fudge factor; B must not start before A ends.
    expect(bStart).toBeGreaterThanOrEqual(aEnd - 5)
  }, 15_000)

  it('different mirror dirs do not block each other', async () => {
    const dirA = makeTempDir()
    const dirB = makeTempDir()
    const HOLD_MS = 150

    const start = Date.now()
    await Promise.all([
      withHostLock(dirA, async () => {
        await new Promise((r) => setTimeout(r, HOLD_MS))
      }),
      withHostLock(dirB, async () => {
        await new Promise((r) => setTimeout(r, HOLD_MS))
      }),
    ])
    const elapsed = Date.now() - start
    // If they ran in parallel, elapsed ~= HOLD_MS. If serialized, ~= 2*HOLD_MS.
    expect(elapsed).toBeLessThan(HOLD_MS * 1.8)
  }, 15_000)
})
