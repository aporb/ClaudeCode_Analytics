// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimePicker } from './TimePicker'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  push.mockClear()
  document.cookie = ''
})

describe('TimePicker', () => {
  it('renders default 7d label when no value provided', () => {
    render(<TimePicker value={undefined} />)
    expect(screen.getByRole('button')).toHaveTextContent('Last 7d')
  })

  it('renders matching preset for current value', () => {
    render(<TimePicker value="30d" />)
    expect(screen.getByRole('button')).toHaveTextContent('Last 30d')
  })

  it('writes ?since=Xd to URL on selection', () => {
    render(<TimePicker value="7d" />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Last 30d'))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('since=30d'))
  })

  it('writes the cookie on selection', () => {
    render(<TimePicker value="7d" />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Last 30d'))
    expect(document.cookie).toContain('cca-since=30d')
  })
})
