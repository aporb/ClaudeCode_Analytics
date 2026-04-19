import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { Command } from 'commander'
import { statusCommand } from './commands/status.js'

const program = new Command()
program.name('cca').description('Claude Code Analytics CLI').version('0.1.0')

program.addCommand(statusCommand())

program.parseAsync().catch((e) => { console.error(e); process.exit(1) })
