import { readFileSync } from 'node:fs'
import { z } from 'zod'

const HOST_REGEX = /^[a-z0-9][a-z0-9_-]*$/

const RemoteEntrySchema = z.object({
  host: z
    .string()
    .regex(
      HOST_REGEX,
      'host is invalid: must match /^[a-z0-9][a-z0-9_-]*$/ (no path-traversal characters)',
    )
    .refine((v) => v !== 'local', { message: 'host "local" is reserved for the live daemon' }),
  ssh: z.string().min(1, 'ssh must be non-empty'),
  claudeHome: z.string().min(1).optional(),
})

const RemotesConfigSchema = z.array(RemoteEntrySchema).superRefine((arr, ctx) => {
  const seen = new Set<string>()
  for (const e of arr) {
    if (seen.has(e.host)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate host label: ${e.host}`,
      })
    }
    seen.add(e.host)
  }
})

export interface RemoteEntry {
  host: string
  ssh: string
  claudeHome: string
}

export function parseRemotesConfig(raw: string): RemoteEntry[] {
  const json = JSON.parse(raw)
  const validated = RemotesConfigSchema.parse(json)
  return validated.map((e) => ({
    host: e.host,
    ssh: e.ssh,
    claudeHome: e.claudeHome ?? '~/.claude',
  }))
}

export function loadRemotesConfig(path: string): RemoteEntry[] {
  const raw = readFileSync(path, 'utf8')
  return parseRemotesConfig(raw)
}
