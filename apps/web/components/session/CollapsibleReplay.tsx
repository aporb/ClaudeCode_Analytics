'use client'

import { useState } from 'react'

export function CollapsibleReplay({ initialOpen = false, count, children }:
  { initialOpen?: boolean; count: { messages: number; toolCalls: number }; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <div className="border border-border rounded-md">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-2 hover:bg-muted/30 text-sm flex items-center justify-between">
        <span>{open ? '▾' : '▸'} Replay timeline ({count.messages} messages, {count.toolCalls} tool calls)</span>
        <span className="text-xs text-muted-foreground">{open ? 'collapse' : 'expand'}</span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  )
}
