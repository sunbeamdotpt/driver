import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Favorites from '../Favorites'

vi.mock('../../api/files', () => ({
  useFavoriteFiles: vi.fn(() => ({
    data: [
      {
        id: 'fav-1',
        filename: 'starred.pdf',
        mimetype: 'application/pdf',
        size: 4096,
        owner_id: 'user-12345678',
        parent_id: null,
        is_folder: false,
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-20T10:00:00Z',
        deleted_at: null,
        s3_key: 's3/fav-1',
        favorited: true,
      },
    ],
    isLoading: false,
  })),
}))

vi.mock('../../components/FileBrowser', () => ({
  default: ({ files, isLoading }: any) => (
    <div data-testid="file-browser">
      {isLoading ? 'Loading...' : `${files.length} files`}
    </div>
  ),
}))

describe('Favorites page', () => {
  it('renders heading', () => {
    render(
      <MemoryRouter>
        <Favorites />
      </MemoryRouter>
    )
    expect(screen.getByText('Favorites')).toBeDefined()
  })

  it('renders FileBrowser with data', () => {
    render(
      <MemoryRouter>
        <Favorites />
      </MemoryRouter>
    )
    expect(screen.getByTestId('file-browser')).toBeDefined()
    expect(screen.getByText('1 files')).toBeDefined()
  })

  it('passes isLoading to FileBrowser', async () => {
    const { useFavoriteFiles } = await import('../../api/files') as any
    useFavoriteFiles.mockReturnValue({ data: undefined, isLoading: true })

    render(
      <MemoryRouter>
        <Favorites />
      </MemoryRouter>
    )
    expect(screen.getByText('Loading...')).toBeDefined()
  })
})
