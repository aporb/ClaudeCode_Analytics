import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTodosDir } from '../src/todos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(__dirname, 'fixtures/todos')

describe('todos parser', () => {
  it('reads all todo files and extracts session/agent ids', async () => {
    const out = []
    for await (const t of readTodosDir(DIR)) out.push(t)
    expect(out).toHaveLength(2)
    const s1 = out.find((t) => t.sessionId === 'session1')
    expect(s1?.agentId).toBe('session1')
    expect(Array.isArray(s1?.todos)).toBe(true)
    expect((s1?.todos as unknown[]).length).toBe(2)
  })
})
