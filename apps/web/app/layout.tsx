import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Claude Code Analytics',
  description: 'Review your Claude Code sessions locally',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono antialiased bg-background text-foreground min-h-screen">
        <Nav since={undefined} />
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </body>
    </html>
  )
}
