import { spawn } from 'node:child_process'
import { Command } from 'commander'
import pc from 'picocolors'

export function openCommand(): Command {
  return new Command('open')
    .description('Open the web UI at a specific session')
    .argument('<session-id>', 'session uuid or prefix')
    .option('--port <n>', 'web UI port', '3939')
    .action(async (sessionId: string, opts: { port: string }) => {
      const url = `http://localhost:${opts.port}/session/${sessionId}`
      console.log(pc.dim(`opening ${url} ...`))
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
    })
}
