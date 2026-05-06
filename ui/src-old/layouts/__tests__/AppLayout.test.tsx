import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppLayout from '../AppLayout'

// Mock useSession
vi.mock('../../api/session', () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      },
      active: true,
    },
  })),
}))

// Mock WaffleButton
vi.mock('../../components/WaffleButton', () => ({
  default: () => <button data-testid="waffle-button">Apps</button>,
}))

// Mock ProfileMenu
vi.mock('../../components/ProfileMenu', () => ({
  default: ({ user }: any) => <div data-testid="profile-menu">{user.name}</div>,
}))

// Mock react-aria-components ListBox/ListBoxItem
vi.mock('react-aria-components', () => ({
  ListBox: ({ children, 'aria-label': ariaLabel, onAction, ...props }: any) => (
    <ul role="listbox" aria-label={ariaLabel} {...props}>
      {typeof children === 'function' ? children : children}
    </ul>
  ),
  ListBoxItem: ({ children, id, textValue, ...props }: any) => (
    <li role="option" data-id={id} {...props}>
      {typeof children === 'function' ? children({ isSelected: false }) : children}
    </li>
  ),
}))

function renderLayout(path = '/explorer') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/explorer" element={<div data-testid="explorer-page">Explorer</div>} />
          <Route path="/recent" element={<div data-testid="recent-page">Recent</div>} />
          <Route path="/favorites" element={<div data-testid="favorites-page">Favorites</div>} />
          <Route path="/trash" element={<div data-testid="trash-page">Trash</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('renders the header with Drive title', () => {
    renderLayout()
    expect(screen.getByText('Drive')).toBeDefined()
  })

  it('renders WaffleButton', () => {
    renderLayout()
    expect(screen.getByTestId('waffle-button')).toBeDefined()
  })

  it('renders ProfileMenu with user', () => {
    renderLayout()
    expect(screen.getByTestId('profile-menu')).toBeDefined()
    expect(screen.getByText('Test User')).toBeDefined()
  })

  it('renders navigation with all nav items', () => {
    renderLayout()
    expect(screen.getByText('My Files')).toBeDefined()
    expect(screen.getByText('Recent')).toBeDefined()
    expect(screen.getByText('Favorites')).toBeDefined()
    expect(screen.getByText('Trash')).toBeDefined()
  })

  it('renders the Outlet content', () => {
    renderLayout('/explorer')
    expect(screen.getByTestId('explorer-page')).toBeDefined()
  })

  it('renders the navigation listbox', () => {
    renderLayout()
    expect(screen.getByRole('listbox', { name: 'Navigation' })).toBeDefined()
  })

  it('does not show ProfileMenu when no user', async () => {
    const { useSession } = await import('../../api/session') as any
    useSession.mockReturnValue({ data: undefined })

    renderLayout()
    expect(screen.queryByTestId('profile-menu')).toBeNull()
  })
})
