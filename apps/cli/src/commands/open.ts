import { Command } from 'commander'
import pc from 'picocolors'
import { spawn } from 'node:child_process'

export function openCommand(): Command {
  return new Command('open')
    .description('Open the web UI at a specific session (Plan 3)')
    .argument('<session-id>', 'session uuid or prefix')
    .option('--port <n>', 'web UI port', '3939')
    .action(async (sessionId: string, opts: { port: string }) => {
      const url = `http://localhost:${opts.port}/session/${sessionId}`
      console.log(pc.dim(`opening ${url} ...`))
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      console.log(pc.yellow('(web UI is not yet built — see Plan 3)'))
    })
}
