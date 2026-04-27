// Top-level event discriminator
export type EventType =
  | 'user'
  | 'assistant'
  | 'progress'
  | 'file-history-snapshot'
  | 'summary'
  | 'hook'

// A single parsed JSONL line, typed.
export interface ParsedEvent {
  uuid: string
  sessionId: string
  parentUuid: string | null
  type: EventType
  subtype: string | null
  timestamp: Date
  cwd: string | null
  projectPath: string | null
  gitBranch: string | null
  ccVersion: string | null
  entrypoint: string | null
  isSidechain: boolean
  agentId: string | null
  requestId: string | null
  payload: unknown // raw JSON line
  sourceFile: string
}

// Derived message row
export interface DerivedMessage {
  uuid: string
  sessionId: string
  role: 'user' | 'assistant'
  timestamp: Date
  model: string | null
  textContent: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheCreationTokens: number | null
  cacheReadTokens: number | null
  isSidechain: boolean
}

// Derived tool call (tool_use + tool_result joined)
export interface DerivedToolCall {
  uuid: string // = tool_use event uuid
  sessionId: string
  timestamp: Date
  toolName: string
  input: unknown
  result: unknown | null
  resultUuid: string | null
  durationMs: number | null
  isError: boolean | null
  parentMessageUuid: string | null
}

// Rolled-up session
export interface DerivedSession {
  sessionId: string
  projectPath: string | null
  startedAt: Date | null
  endedAt: Date | null
  durationSec: number | null
  messageCount: number
  toolCallCount: number
  subagentCount: number
  gitBranch: string | null
  ccVersion: string | null
  modelsUsed: string[]
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreation: number
  totalCacheRead: number
  estimatedCostUsd: number | null
  firstUserPrompt: string | null
  status: 'active' | 'ended' | null
}
