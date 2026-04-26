import type { Briefing } from '@/lib/briefing'

export function BriefingCard({ briefing }: { briefing: Briefing }) {
  return (
    <div className="border-l-4 border-green-500 bg-green-500/5 rounded-r-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Briefing</div>
      {briefing.lines.map((line, i) => (
        <p key={i} className="text-sm leading-relaxed">{line}</p>
      ))}
    </div>
  )
}
