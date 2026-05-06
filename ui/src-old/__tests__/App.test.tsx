import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock all dependencies to avoid complex rendering
vi.mock('@gouvfr-lasuite/cunningham-react', () => ({
  CunninghamProvider: ({ children }: any) => <div data-testid="cunningham">{children}</div>,
}))

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(() => ({})),
  QueryClientProvider: ({ children }: any) => <div data-testid="query-provider">{children}</div>,
}))

vi.mock('../cunningham/useCunninghamTheme', () => ({
  useCunninghamTheme: vi.fn(() => ({ theme: 'default' })),
}))

vi.mock('../layouts/AppLayout', () => ({
  default: () => <div data-testid="app-layout">AppLayout</div>,
}))

vi.mock('../pages/Explorer', () => ({
  default: () => <div>Explorer</div>,
}))

vi.mock('../pages/Recent', () => ({
  default: () => <div>Recent</div>,
}))

vi.mock('../pages/Favorites', () => ({
  default: () => <div>Favorites</div>,
}))

vi.mock('../pages/Trash', () => ({
  default: () => <div>Trash</div>,
}))

vi.mock('../pages/Editor', () => ({
  default: () => <div>Editor</div>,
}))

import App from '../App'

describe('App', () => {
  it('renders the app with providers', () => {
    render(<App />)
    expect(screen.getByTestId('cunningham')).toBeDefined()
    expect(screen.getByTestId('query-provider')).toBeDefined()
  })
})
