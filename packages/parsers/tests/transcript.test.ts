import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { readTranscript } from '../src/transcript.js'

const FIXTURE = resolve(__dirname, 'fixtures/transcript-sample.jsonl')

describe('transcript parser', () => {
  it('yields 4 typed events with correct discriminators', async () => {
    const events = []
    for await (const e of readTranscript(FIXTURE)) events.push(e)
    expect(events).toHaveLength(4)
    expect(events.map((e) => e.type)).toEqual(['progress', 'user', 'assistant', 'user'])
    expect(events[0]?.subtype).toBe('hook_progress')
    expect(events[2]?.subtype).toBe('assistant_message')
    expect(events[3]?.subtype).toBe('tool_result')
  })

  it('marks subagent files as sidechain', async () => {
    // fake path under .../subagents/agent-*.jsonl — we only check the flag logic
    const subPath = '/x/.claude/projects/-foo/subagents/agent-abc.jsonl'
    // Since we're not reading a real file, construct via helper
    const { isSidechainPath } = await import('../src/transcript.js')
    expect(isSidechainPath(subPath)).toBe(true)
    expect(isSidechainPath('/x/.claude/projects/-foo/abc.jsonl')).toBe(false)
  })

  it('extracts agent_id from subagent filename', async () => {
    const { agentIdFromPath } = await import('../src/transcript.js')
    expect(agentIdFromPath('/x/subagents/agent-abc123.jsonl')).toBe('abc123')
    expect(agentIdFromPath('/x/abc.jsonl')).toBeNull()
  })
})
