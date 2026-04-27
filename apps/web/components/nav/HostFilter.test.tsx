import { fireEvent, render, screen } from '@testing-library/react'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HostFilter } from './HostFilter'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  push.mockClear()
  document.cookie = 'cca-hosts=; path=/; max-age=0'
})

describe('HostFilter', () => {
  it('renders "host: all" when current is null', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={null} />)
    expect(screen.getByRole('button')).toHaveTextContent('host: all')
  })

  it('renders "host: <selected>" when current is a subset', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={['hostinger']} />)
    expect(screen.getByRole('button')).toHaveTextContent('host: hostinger')
  })

  it('renders a checkbox per host when opened', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={null} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByLabelText('local')).toBeInTheDocument()
    expect(screen.getByLabelText('hostinger')).toBeInTheDocument()
  })

  it('toggling a host updates URL with ?host=', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={null} />)
    fireEvent.click(screen.getByRole('button'))
    // current is null => set seeds with allHosts ['local','hostinger'].
    // Toggling 'hostinger' removes it, leaves ['local'] (subset → ?host=local).
    fireEvent.click(screen.getByLabelText('hostinger'))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('host=local'))
  })

  it('writes the cca-hosts cookie on change', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={null} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('hostinger'))
    expect(document.cookie).toContain('cca-hosts=local')
  })

  it('clears ?host= when toggling restores all hosts', () => {
    render(<HostFilter allHosts={['local', 'hostinger']} current={['local']} />)
    fireEvent.click(screen.getByRole('button'))
    // current=['local']; toggling 'hostinger' adds it → set becomes all → param cleared.
    fireEvent.click(screen.getByLabelText('hostinger'))
    expect(push).toHaveBeenCalled()
    const arg = push.mock.calls[0]?.[0] as string | undefined
    expect(arg).toBeDefined()
    expect(arg!).not.toContain('host=')
  })
})
