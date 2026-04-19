import { describe, it, expect } from 'vitest'
import { Broadcaster } from '../src/daemon/broadcaster.js'

describe('Broadcaster', () => {
  it('delivers events to all subscribers', () => {
    const b = new Broadcaster()
    const a: unknown[] = []
    const x: unknown[] = []
    const unsubA = b.subscribe((e) => a.push(e))
    b.subscribe((e) => x.push(e))
    b.publish({ kind: 'event', payload: { uuid: '1' } })
    b.publish({ kind: 'status', payload: { session: 's', status: 'active' } })
    expect(a).toHaveLength(2)
    expect(x).toHaveLength(2)
    unsubA()
    b.publish({ kind: 'event', payload: { uuid: '2' } })
    expect(a).toHaveLength(2)
    expect(x).toHaveLength(3)
  })

  it('isolates subscriber errors', () => {
    const b = new Broadcaster()
    b.subscribe(() => { throw new Error('boom') })
    const good: unknown[] = []
    b.subscribe((e) => good.push(e))
    expect(() => b.publish({ kind: 'event', payload: { n: 1 } })).not.toThrow()
    expect(good).toHaveLength(1)
  })
})
