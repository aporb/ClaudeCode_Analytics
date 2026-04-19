export interface BroadcastEvent {
  kind: 'event' | 'status' | 'heartbeat'
  payload: unknown
}

export type Subscriber = (event: BroadcastEvent) => void

export class Broadcaster {
  #subscribers = new Set<Subscriber>()

  subscribe(fn: Subscriber): () => void {
    this.#subscribers.add(fn)
    return () => this.#subscribers.delete(fn)
  }

  publish(event: BroadcastEvent): void {
    for (const fn of this.#subscribers) {
      try { fn(event) } catch (e) {
        console.error('broadcaster subscriber error:', e)
      }
    }
  }

  get size(): number { return this.#subscribers.size }
}
