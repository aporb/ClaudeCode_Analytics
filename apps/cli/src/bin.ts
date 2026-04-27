import { resolve } from 'node:path'
import { config } from 'dotenv'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { Command } from 'commander'
import { openCommand } from './commands/open.js'
import { replayCommand } from './commands/replay.js'
import { searchCommand } from './commands/search.js'
import { sessionsCommand } from './commands/sessions.js'
import { statsCommand } from './commands/stats.js'
import { statusCommand } from './commands/status.js'
import { syncCommand } from './commands/sync.js'
import { tailCommand } from './commands/tail.js'

const program = new Command()
program.name('cca').description('Claude Code Analytics CLI').version('0.1.0')

program.addCommand(statusCommand())
program.addCommand(sessionsCommand())
program.addCommand(replayCommand())
program.addCommand(searchCommand())
program.addCommand(statsCommand())
program.addCommand(tailCommand())
program.addCommand(openCommand())
program.addCommand(syncCommand())

program.parseAsync().catch((e) => {
  console.error(e)
  process.exit(1)
})
