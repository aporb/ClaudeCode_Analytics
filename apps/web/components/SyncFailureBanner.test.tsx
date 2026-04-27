// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FailingHost } from '@/lib/queries/hosts'

// Mock the query module so the banner doesn't hit a real DB.
const { getFailingHostsMock, cookieMap } = vi.hoisted(() => ({
  getFailingHostsMock: vi.fn<[], Promise<FailingHost[]>>(),
  cookieMap: new Map<string, string>(),
}))
vi.mock('@/lib/queries/hosts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/hosts')>(
    '@/lib/queries/hosts',
  )
  return { ...actual, getFailingHosts: getFailingHostsMock }
})

// Mock next/headers cookies — controlled per test via cookieMap.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const v = cookieMap.get(name)
      return v === undefined ? undefined : { name, value: v }
    },
  }),
}))

import { SyncFailureBanner } from './SyncFailureBanner'

beforeEach(() => {
  getFailingHostsMock.mockReset()
  cookieMap.clear()
})

describe('SyncFailureBanner', () => {
  it('renders nothing when no host has consecutive_errors >= 3', async () => {
    getFailingHostsMock.mockResolvedValue([])
    const ui = await SyncFailureBanner()
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })

  it('renders a row per failing host with error summary', async () => {
    getFailingHostsMock.mockResolvedValue([
      {
        host: 'hostinger',
        consecutiveErrors: 3,
        lastError: 'ssh: connect to host hostinger port 22: Connection refused',
        lastErrorAt: new Date('2099-04-01T00:00:00Z'),
      },
      {
        host: 'picoclaw',
        consecutiveErrors: 7,
        lastError: 'rsync exited 255',
        lastErrorAt: new Date('2099-04-02T00:00:00Z'),
      },
    ])
    const ui = await SyncFailureBanner()
    render(ui)
    expect(screen.getAllByText(/Sync failing for/i)).toHaveLength(2)
    expect(screen.getByText('hostinger')).toBeInTheDocument()
    expect(screen.getByText(/3 consecutive errors/)).toBeInTheDocument()
    expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
    expect(screen.getByText('picoclaw')).toBeInTheDocument()
    expect(screen.getByText(/7 consecutive errors/)).toBeInTheDocument()
  })

  it('hides a host whose dismissal cookie matches the current error count', async () => {
    getFailingHostsMock.mockResolvedValue([
      {
        host: 'hostinger',
        consecutiveErrors: 3,
        lastError: 'boom',
        lastErrorAt: new Date('2099-04-01T00:00:00Z'),
      },
    ])
    cookieMap.set('cca-banner-dismissed-hostinger', '3')
    const ui = await SyncFailureBanner()
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })

  it('re-shows a host when the error count moves past the dismissed value', async () => {
    getFailingHostsMock.mockResolvedValue([
      {
        host: 'hostinger',
        consecutiveErrors: 5,
        lastError: 'still boom',
        lastErrorAt: new Date('2099-04-02T00:00:00Z'),
      },
    ])
    cookieMap.set('cca-banner-dismissed-hostinger', '3')
    const ui = await SyncFailureBanner()
    render(ui)
    expect(screen.getByText(/5 consecutive errors/)).toBeInTheDocument()
  })

  it('returns null when the query throws (DB unreachable / table missing)', async () => {
    getFailingHostsMock.mockRejectedValue(new Error('relation "host_sync_state" does not exist'))
    const ui = await SyncFailureBanner()
    const { container } = render(ui)
    expect(container.firstChild).toBeNull()
  })
})
