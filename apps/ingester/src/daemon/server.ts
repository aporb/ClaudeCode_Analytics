import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { sessions } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { Broadcaster, BroadcastEvent } from './broadcaster.js'

type Db = PostgresJsDatabase<typeof schema>

export interface ServerOptions {
  port: number
  db: Db
  broadcaster: Broadcaster
  startedAt: number
}

export interface RunningServer {
  stop: () => Promise<void>
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  let lastEventAt: number | null = null
  opts.broadcaster.subscribe(() => { lastEventAt = Date.now() })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${opts.port}`)
    if (req.method === 'GET' && url.pathname === '/status') {
      writeJson(res, 200, {
        ok: true,
        uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
        subscribers: opts.broadcaster.size,
        lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/hook') {
      const body = await readJsonBody(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
      const event = typeof body.event === 'string' ? body.event : null
      if (!sessionId || !event) {
        writeJson(res, 400, { error: 'sessionId and event required' })
        return
      }
      const status = event === 'SessionStart' ? 'active'
        : event === 'SessionEnd' || event === 'Stop' ? 'ended'
        : null
      if (status) {
        await opts.db
          .insert(sessions)
          .values({ sessionId, status })
          .onConflictDoUpdate({
            target: sessions.sessionId,
            set: { status: sql`EXCLUDED.status` },
          })
      }
      opts.broadcaster.publish({ kind: 'status', payload: { sessionId, event, status } })
      res.writeHead(204); res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      const write = (e: BroadcastEvent) => {
        res.write(`event: ${e.kind}\ndata: ${JSON.stringify(e.payload)}\n\n`)
      }
      res.write(`event: heartbeat\ndata: {}\n\n`)
      const unsub = opts.broadcaster.subscribe(write)
      req.on('close', () => unsub())
      return
    }

    res.writeHead(404); res.end()
  })

  await new Promise<void>((resolve) => server.listen(opts.port, 'localhost', resolve))

  return {
    async stop() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
    },
  }
}
