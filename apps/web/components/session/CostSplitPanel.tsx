import { Badge } from '@/components/ui/badge'

function modelChipClass(model: string): string {
  if (model.includes('opus')) return 'border-[hsl(var(--model-opus))] text-[hsl(var(--model-opus))]'
  if (model.includes('sonnet')) return 'border-[hsl(var(--model-sonnet))] text-[hsl(var(--model-sonnet))]'
  if (model.includes('haiku')) return 'border-[hsl(var(--model-haiku))] text-[hsl(var(--model-haiku))]'
  return ''
}

export function CostSplitPanel({ costByModel, inputTokens, outputTokens, cacheReadTokens }:
  { costByModel: { model: string; cost: number }[]
    inputTokens: number; outputTokens: number; cacheReadTokens: number }) {
  const total = costByModel.reduce((s, x) => s + x.cost, 0)
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Cost split</div>
      {costByModel.map((r) => (
        <div key={r.model} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
          <Badge variant="outline" className={modelChipClass(r.model)}>
            {r.model.replace(/^claude-/, '').replace(/-\d+$/, '')}
          </Badge>
          <span><b>${r.cost.toFixed(2)}</b> · {total > 0 ? Math.round((r.cost / total) * 100) : 0}%</span>
        </div>
      ))}
      <div className="pt-2 text-xs text-muted-foreground">Tokens (in/out/cache-read)</div>
      <div className="flex justify-between text-xs"><span>in</span><span>{inputTokens.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span>out</span><span>{outputTokens.toLocaleString()}</span></div>
      <div className="flex justify-between text-xs"><span>cache read</span><span>{cacheReadTokens.toLocaleString()}</span></div>
    </div>
  )
}
