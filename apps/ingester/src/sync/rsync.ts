import { spawn } from 'node:child_process'

export interface RsyncVersion {
  major: number
  minor: number
}

export interface RsyncStats {
  filesTransferred: number | null
  bytesTransferred: number | null
}

export type RsyncOutcome =
  | { kind: 'success-non-empty'; stats: RsyncStats; stdout: string }
  | { kind: 'success-empty'; stats: RsyncStats; stdout: string }
  | { kind: 'error'; exitCode: number; stderr: string }

export function detectRsyncVersion(versionStdout: string): RsyncVersion | null {
  const m = versionStdout.match(/rsync\s+version\s+(\d+)\.(\d+)/i)
  if (!m) return null
  const [, major, minor] = m
  return { major: Number(major), minor: Number(minor) }
}

export function parseRsyncStats(stdout: string, version: RsyncVersion): RsyncStats {
  if (version.major >= 3) {
    const files = stdout.match(/Number of regular files transferred:\s*([\d,]+)/i)
    const bytes = stdout.match(/Total transferred file size:\s*([\d,]+)/i)
    if (files?.[1]) {
      return {
        filesTransferred: Number(files[1].replace(/,/g, '')),
        bytesTransferred: bytes?.[1] ? Number(bytes[1].replace(/,/g, '')) : null,
      }
    }
  }
  // Fallback: count non-empty --itemize-changes lines (rsync 2.6.9 or absent stats2)
  const lines = stdout.split('\n').filter((l) => /^[<>ch.*+]/.test(l))
  if (lines.length > 0 || version.major < 3) {
    return { filesTransferred: lines.length, bytesTransferred: 0 }
  }
  return { filesTransferred: null, bytesTransferred: null }
}

export async function detectInstalledRsyncVersion(): Promise<RsyncVersion | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('rsync', ['--version'])
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('close', () => resolve(detectRsyncVersion(out)))
    p.on('error', () => resolve(null))
  })
}

export async function runRsync(
  sshTarget: string,
  remoteHome: string,
  localDest: string,
  version: RsyncVersion,
): Promise<RsyncOutcome> {
  const args =
    version.major >= 3
      ? ['-az', '--delete-after', '--info=stats2', `${sshTarget}:${remoteHome}/`, `${localDest}/`]
      : [
          '-az',
          '--delete-after',
          '--itemize-changes',
          `${sshTarget}:${remoteHome}/`,
          `${localDest}/`,
        ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const p = spawn('rsync', args)
    p.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    p.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    p.on('close', (code) => {
      if (code !== 0) return resolve({ kind: 'error', exitCode: code ?? -1, stderr })
      const stats = parseRsyncStats(stdout, version)
      // Conservative: if parse fails, treat as non-empty (we'd rather over-ingest than skip)
      if (stats.filesTransferred === null || stats.filesTransferred > 0) {
        resolve({ kind: 'success-non-empty', stats, stdout })
      } else {
        resolve({ kind: 'success-empty', stats, stdout })
      }
    })
    p.on('error', (err) => resolve({ kind: 'error', exitCode: -1, stderr: err.message }))
  })
}
