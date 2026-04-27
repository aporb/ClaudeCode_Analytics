import { EventSourceParserStream } from 'eventsource-parser/stream'

export interface SSEEvent {
  event: string
  data: string
}

export async function* consumeSse(url: string, signal: AbortSignal): AsyncGenerator<SSEEvent> {
  const res = await fetch(url, { signal, headers: { accept: 'text/event-stream' } })
  if (!res.ok) throw new Error(`SSE connect failed: ${res.status}`)
  if (!res.body) throw new Error('SSE response has no body')
  const stream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    if (value) yield { event: value.event ?? 'message', data: value.data }
  }
}
