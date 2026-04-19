import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { LiveIndicator } from '@/components/LiveIndicator'

export const metadata: Metadata = {
  title: 'Claude Code Analytics',
  description: 'Review your Claude Code sessions locally',
}

const navItems = [
  { href: '/', label: 'Sessions' },
  { href: '/search', label: 'Search' },
  { href: '/stats', label: 'Stats' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono antialiased bg-background text-foreground min-h-screen">
        <header className="border-b">
          <div className="max-w-7xl mx-auto flex items-center gap-6 px-6 h-14">
            <Link href="/" className="font-semibold">cca</Link>
            <nav className="flex items-center gap-6 text-sm text-muted-foreground flex-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              ))}
            </nav>
            <LiveIndicator />
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </div>
      </body>
    </html>
  )
}
