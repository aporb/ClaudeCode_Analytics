'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const KNOWN_MODELS = [
  { value: 'claude-opus-4-7', label: 'Opus' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

export function SessionFilters({
  initial,
}: { initial: { project: string; model: string; sort: string } }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [project, setProject] = useState(initial.project)
  const [models, setModels] = useState<string[]>(
    initial.model ? initial.model.split(',').filter(Boolean) : [],
  )
  const [sort, setSort] = useState<'recent' | 'cost'>(initial.sort === 'cost' ? 'cost' : 'recent')

  function apply() {
    const next = new URLSearchParams(sp.toString())
    if (project) next.set('project', project)
    else next.delete('project')
    if (models.length) next.set('model', models.join(','))
    else next.delete('model')
    next.set('sort', sort)
    next.delete('page')
    router.push(`?${next.toString()}`)
  }
  function reset() {
    router.push('?')
  }

  return (
    <div className="flex flex-wrap gap-2 items-end border border-border rounded-md p-3">
      <label className="text-xs">
        <div className="text-muted-foreground">Project</div>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="substring match"
          className="px-2 py-1 rounded border border-border bg-background text-sm w-48"
        />
      </label>
      <div className="text-xs">
        <div className="text-muted-foreground">Models</div>
        <div className="flex gap-1">
          {KNOWN_MODELS.map((m) => {
            const on = models.includes(m.value)
            return (
              <button
                key={m.value}
                type="button"
                onClick={() =>
                  setModels(on ? models.filter((x) => x !== m.value) : [...models, m.value])
                }
                className={`px-2 py-1 rounded text-xs border ${on ? 'border-foreground bg-muted' : 'border-border opacity-70'}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">Sort</div>
        <button
          type="button"
          onClick={() => setSort(sort === 'recent' ? 'cost' : 'recent')}
          className="px-2 py-1 rounded text-xs border border-border"
        >
          {sort === 'recent' ? 'Most recent' : 'Highest cost'}
        </button>
      </div>
      <button
        type="button"
        onClick={apply}
        className="ml-auto px-3 py-1.5 rounded border border-border text-sm hover:bg-muted/50"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={reset}
        className="px-3 py-1.5 rounded text-sm hover:bg-muted/50"
      >
        Reset
      </button>
    </div>
  )
}
