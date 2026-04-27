import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSync } from '../src/sync/index.js'

describe('sync/runSync — entry point', () => {
  let tempRoot: string
  let configPath: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'cca-runsync-'))
    configPath = join(tempRoot, 'cca.remotes.json')
  })

  afterEach(() => {
    try {
      rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('throws "unknown host" when --host is set but no matching entry', async () => {
    writeFileSync(
      configPath,
      JSON.stringify([
        { host: 'alpha', ssh: 'user@alpha.example', claudeHome: '~/.claude' },
        { host: 'beta', ssh: 'user@beta.example', claudeHome: '~/.claude' },
      ]),
    )

    await expect(runSync({ repoRoot: tempRoot, configPath, host: 'gamma' })).rejects.toThrow(
      /unknown host: gamma/,
    )
  })

  it('throws "no remotes configured" when registry is empty', async () => {
    writeFileSync(configPath, JSON.stringify([]))

    await expect(runSync({ repoRoot: tempRoot, configPath })).rejects.toThrow(
      /no remotes configured/,
    )
  })
})
