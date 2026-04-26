import Link from 'next/link'
import { cookies } from 'next/headers'
import { TimePicker } from './TimePicker'
import { LiveIndicator } from './LiveIndicator'

const items = [
  { href: '/', label: 'Cost' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/search', label: 'Search' },
  { href: '/stats', label: 'Behavior' },
] as const

export async function Nav({ since }: { since: string | undefined }) {
  const cookieStore = await cookies()
  const cookieSince = cookieStore.get('cca-since')?.value
  const effective = since ?? cookieSince
  return (
    <header className="border-b">
      <div className="max-w-7xl mx-auto flex items-center gap-6 px-6 h-14">
        <Link href="/" className="font-semibold">cca</Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground flex-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <TimePicker value={effective} />
        <LiveIndicator />
      </div>
    </header>
  )
}
