import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import pc from 'picocolors'
import { closeDb } from '@cca/db'
import { runSync, resetHostState } from '@cca/ingester/sync'

export function syncCommand(): Command {
  return new Command('sync')
    .description('Pull remote Claude Code data via SSH+rsync and ingest tagged with host')
    .option('--force', 'skip the per-host due check', false)
    .option('--host <name>', 'sync a single host only')
    .option('--reset-state <name>', 'delete host_sync_state row for <name> (does not delete data)')
    .action(async (opts: { force?: boolean; host?: string; resetState?: string }) => {
      try {
        if (opts.resetState) {
          await resetHostState(opts.resetState)
          console.log(`reset state for ${opts.resetState}`)
          return
        }

        // Resolve repoRoot from this source file's location, not process.cwd().
        // sync.ts lives at apps/cli/src/commands/sync.ts, so the repo root is four levels up.
        const __dirname = dirname(fileURLToPath(import.meta.url))
        const repoRoot = resolve(__dirname, '../../../..')

        const runOpts: Parameters<typeof runSync>[0] = { repoRoot }
        if (opts.force !== undefined) runOpts.force = opts.force
        if (opts.host !== undefined) runOpts.host = opts.host
        const results = await runSync(runOpts)
        for (const r of results) console.log(`  ${r.host}: ${r.kind}`)
      } catch (e) {
        console.error(pc.red((e as Error).message))
        process.exitCode = 1
      } finally {
        await closeDb()
      }
    })
}
