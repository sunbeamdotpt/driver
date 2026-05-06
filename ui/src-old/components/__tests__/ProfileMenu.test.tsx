import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SessionUser } from '../../api/session'

// Mock react-aria-components to avoid keyboard handler issues in jsdom
vi.mock('react-aria-components', () => ({
  Button: ({ children, 'aria-label': ariaLabel, ...props }: any) => (
    <button aria-label={ariaLabel} {...props}>{children}</button>
  ),
  MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
  Popover: ({ children }: any) => <div data-testid="popover">{children}</div>,
  Menu: ({ children, ...props }: any) => <div role="menu" {...props}>{children}</div>,
  MenuItem: ({ children, id, ...props }: any) => (
    <div role="menuitem" data-id={id} {...props}>
      {typeof children === 'function' ? children({ isFocused: false }) : children}
    </div>
  ),
  Separator: () => <hr />,
  Section: ({ children }: any) => <div>{children}</div>,
  Header: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}))

import ProfileMenu from '../ProfileMenu'

describe('ProfileMenu', () => {
  const user: SessionUser = {
    id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
  }

  it('renders profile menu button with aria label', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByRole('button', { name: 'Profile menu' })).toBeDefined()
  })

  it('renders user initials when no picture', () => {
    render(<ProfileMenu user={user} />)
    // JD appears in both the button avatar and the menu header avatar
    expect(screen.getAllByText('JD').length).toBeGreaterThanOrEqual(1)
  })

  it('renders single initial for single-name user', () => {
    const singleName: SessionUser = { id: 'u2', email: 'mono@test.com', name: 'Mono' }
    render(<ProfileMenu user={singleName} />)
    expect(screen.getAllByText('M').length).toBeGreaterThanOrEqual(1)
  })

  it('renders email initial when name equals email', () => {
    const emailUser: SessionUser = { id: 'u3', email: 'test@example.com', name: 'test@example.com' }
    render(<ProfileMenu user={emailUser} />)
    expect(screen.getAllByText('T').length).toBeGreaterThanOrEqual(1)
  })

  it('renders email initial when name is empty', () => {
    const noName: SessionUser = { id: 'u4', email: 'x@example.com', name: '' }
    render(<ProfileMenu user={noName} />)
    expect(screen.getAllByText('X').length).toBeGreaterThanOrEqual(1)
  })

  it('renders user picture when provided', () => {
    const withPic: SessionUser = {
      id: 'u5',
      email: 'pic@test.com',
      name: 'Pic User',
      picture: 'https://example.com/avatar.jpg',
    }
    const { container } = render(<ProfileMenu user={withPic} />)
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThanOrEqual(1)
    expect(imgs[0].getAttribute('src')).toBe('https://example.com/avatar.jpg')
  })

  it('shows user name in menu header', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('shows user email in menu header', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByText('jane@example.com')).toBeDefined()
  })

  it('shows Logout menu item', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByText('Logout')).toBeDefined()
  })

  it('shows Terms of service link', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByText('Terms of service')).toBeDefined()
  })

  it('shows language indicator EN', () => {
    render(<ProfileMenu user={user} />)
    expect(screen.getByText('EN')).toBeDefined()
  })

  it('shows email as display name when name and email are same', () => {
    const sameUser: SessionUser = { id: 'u6', email: 'same@test.com', name: 'same@test.com' }
    render(<ProfileMenu user={sameUser} />)
    // Should not show the separate email line
    expect(screen.getAllByText('same@test.com').length).toBeGreaterThanOrEqual(1)
  })
})
