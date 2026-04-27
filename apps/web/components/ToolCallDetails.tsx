'use client'

import { applyRedactionDeep } from '@/lib/redaction'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface ToolCall {
  uuid: string
  toolName: string
  input: unknown
  result: unknown | null
  durationMs: number | null
  isError: boolean | null
}

export function ToolCallDetails({ call, raw }: { call: ToolCall; raw: boolean }) {
  const [open, setOpen] = useState(false)
  const redactedInput = applyRedactionDeep(call.input, raw)
  const redactedResult = call.result != null ? applyRedactionDeep(call.result, raw) : null
  return (
    <div className="ml-[280px] my-1 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'text-muted-foreground hover:text-foreground',
          call.isError && 'text-destructive hover:text-destructive',
        )}
      >
        {open ? '▾' : '▸'} {call.toolName} details{' '}
        {call.durationMs != null ? `(${call.durationMs}ms)` : ''}
      </button>
      {open && (
        <pre className="mt-1 p-3 rounded bg-muted/50 overflow-x-auto whitespace-pre-wrap break-words">
          <div className="text-muted-foreground mb-1">input:</div>
          <div>{JSON.stringify(redactedInput, null, 2)}</div>
          {redactedResult != null && (
            <>
              <div className="text-muted-foreground mt-3 mb-1">
                result{call.isError ? ' (error)' : ''}:
              </div>
              <div>
                {typeof redactedResult === 'string'
                  ? redactedResult
                  : JSON.stringify(redactedResult, null, 2)}
              </div>
            </>
          )}
        </pre>
      )}
    </div>
  )
}
