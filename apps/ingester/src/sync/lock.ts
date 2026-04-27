import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { lock } from 'proper-lockfile'

/**
 * Acquire an exclusive file lock under `mirrorDir` for the duration of `fn`.
 *
 * Uses a sentinel file (`<mirrorDir>/.lock`) plus `proper-lockfile`'s
 * `<file>.lock` directory mutex. Concurrent callers on the same mirrorDir
 * serialize; different mirrorDirs run in parallel.
 *
 * The retry budget (~30 retries, 1–5 s) covers a long-running rsync window
 * without surfacing transient EEXIST errors to the caller.
 */
export async function withHostLock<T>(mirrorDir: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(mirrorDir, { recursive: true })
  const lockPath = path.join(mirrorDir, '.lock')
  // Ensure the sentinel exists — proper-lockfile requires the target file to exist.
  await writeFile(lockPath, '', { flag: 'a' })
  const release = await lock(lockPath, {
    retries: { retries: 30, minTimeout: 1_000, maxTimeout: 5_000 },
  })
  try {
    return await fn()
  } finally {
    await release()
  }
}
