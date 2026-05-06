import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WaffleButton from '../WaffleButton'

describe('WaffleButton', () => {
  it('renders a button with aria-label Apps', () => {
    render(<WaffleButton />)
    expect(screen.getByRole('button', { name: 'Apps' })).toBeDefined()
  })

  it('renders button with correct title', () => {
    render(<WaffleButton />)
    expect(screen.getByTitle('Apps')).toBeDefined()
  })

  it('renders button text', () => {
    render(<WaffleButton />)
    expect(screen.getByText('Apps')).toBeDefined()
  })

  it('renders with waffle CSS classes', () => {
    render(<WaffleButton />)
    const btn = screen.getByRole('button', { name: 'Apps' })
    expect(btn.className).toContain('lasuite-gaufre-btn')
    expect(btn.className).toContain('lasuite-gaufre-btn--vanilla')
    expect(btn.className).toContain('lasuite-gaufre-btn--small')
  })

  it('has aria-expanded false by default', () => {
    render(<WaffleButton />)
    const btn = screen.getByRole('button', { name: 'Apps' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('has aria-controls for popup', () => {
    render(<WaffleButton />)
    const btn = screen.getByRole('button', { name: 'Apps' })
    expect(btn.getAttribute('aria-controls')).toBe('lasuite-gaufre-popup')
  })

  it('has type button', () => {
    render(<WaffleButton />)
    const btn = screen.getByRole('button', { name: 'Apps' })
    expect(btn.getAttribute('type')).toBe('button')
  })
})
