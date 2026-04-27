'use client'

import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

export function LiveIndicator() {
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null)

  useEffect(() => {
    const es = new EventSource('http://localhost:9939/events')
    const onOpen = () => setConnected(true)
    const onError = () => setConnected(false)
    const onEvent = () => setLastEventAt(new Date())
    es.addEventListener('open', onOpen)
    es.addEventListener('error', onError)
    es.addEventListener('event', onEvent)
    es.addEventListener('status', onEvent)
    es.addEventListener('heartbeat', onOpen)
    return () => {
      es.removeEventListener('open', onOpen)
      es.removeEventListener('error', onError)
      es.removeEventListener('event', onEvent)
      es.removeEventListener('status', onEvent)
      es.removeEventListener('heartbeat', onOpen)
      es.close()
    }
  }, [])

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          'block size-2 rounded-full',
          connected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
        )}
        title={connected ? 'daemon connected' : 'daemon unreachable'}
      />
      {lastEventAt && <span>last event: {lastEventAt.toISOString().slice(11, 19)}</span>}
    </div>
  )
}
