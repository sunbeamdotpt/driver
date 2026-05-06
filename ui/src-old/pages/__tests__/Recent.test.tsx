import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Recent from '../Recent'

vi.mock('../../api/files', () => ({
  useRecentFiles: vi.fn(() => ({
    data: [
      {
        id: 'file-1',
        filename: 'recent-doc.docx',
        mimetype: 'application/msword',
        size: 2048,
        owner_id: 'user-12345678',
        parent_id: null,
        is_folder: false,
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-20T10:00:00Z',
        deleted_at: null,
        s3_key: 's3/file-1',
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

describe('Recent page', () => {
  it('renders heading', () => {
    render(
      <MemoryRouter>
        <Recent />
      </MemoryRouter>
    )
    expect(screen.getByText('Recent Files')).toBeDefined()
  })

  it('renders FileBrowser with data', () => {
    render(
      <MemoryRouter>
        <Recent />
      </MemoryRouter>
    )
    expect(screen.getByTestId('file-browser')).toBeDefined()
    expect(screen.getByText('1 files')).toBeDefined()
  })

  it('passes isLoading to FileBrowser', async () => {
    const { useRecentFiles } = await import('../../api/files') as any
    useRecentFiles.mockReturnValue({ data: undefined, isLoading: true })

    render(
      <MemoryRouter>
        <Recent />
      </MemoryRouter>
    )
    expect(screen.getByText('Loading...')).toBeDefined()
  })
})
