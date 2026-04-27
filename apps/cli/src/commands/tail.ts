import { Command } from 'commander'
import pc from 'picocolors'
import { consumeSse } from '../lib/sse-client.js'

export function tailCommand(): Command {
  return new Command('tail')
    .description('Stream live daemon events (SSE)')
    .option('--port <n>', 'daemon port', '9939')
    .action(async (opts: { port: string }) => {
      const url = `http://localhost:${opts.port}/events`
      console.log(pc.dim(`[cca tail] connecting to ${url} ... (Ctrl-C to stop)`))
      const controller = new AbortController()
      process.on('SIGINT', () => controller.abort())
      try {
        for await (const { event, data } of consumeSse(url, controller.signal)) {
          const when = new Date().toISOString().slice(11, 19)
          const kind =
            event === 'status'
              ? pc.yellow(event)
              : event === 'event'
                ? pc.cyan(event)
                : pc.dim(event)
          console.log(`${pc.dim(when)} ${kind.padEnd(20)} ${data}`)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError')
          console.error(pc.red(`tail: ${(e as Error).message}`))
      }
    })
}
