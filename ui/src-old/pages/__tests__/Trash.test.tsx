import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Trash from '../Trash'

const mockRestoreMutate = vi.fn()

vi.mock('../../api/files', () => ({
  useTrashFiles: vi.fn(() => ({
    data: [
      {
        id: 'trash-1',
        filename: 'deleted.txt',
        mimetype: 'text/plain',
        size: 512,
        owner_id: 'user-12345678',
        parent_id: null,
        is_folder: false,
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-20T10:00:00Z',
        deleted_at: '2026-03-22T10:00:00Z',
        s3_key: 's3/trash-1',
      },
    ],
    isLoading: false,
  })),
  useRestoreFile: vi.fn(() => ({ mutate: mockRestoreMutate })),
}))

vi.mock('../../components/FileBrowser', () => ({
  default: ({ files, isLoading, isTrash, onRestore }: any) => (
    <div data-testid="file-browser">
      {isLoading ? 'Loading...' : `${files.length} files`}
      {isTrash && <span data-testid="is-trash">trash</span>}
      {onRestore && (
        <button data-testid="restore-btn" onClick={() => onRestore('trash-1')}>
          Restore
        </button>
      )}
    </div>
  ),
}))

describe('Trash page', () => {
  it('renders heading', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    expect(screen.getByText('Trash')).toBeDefined()
  })

  it('renders 30-day notice', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    expect(screen.getByText(/permanently deleted after 30 days/)).toBeDefined()
  })

  it('renders FileBrowser with data', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    expect(screen.getByTestId('file-browser')).toBeDefined()
    expect(screen.getByText('1 files')).toBeDefined()
  })

  it('passes isTrash to FileBrowser', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    expect(screen.getByTestId('is-trash')).toBeDefined()
  })

  it('passes onRestore callback to FileBrowser', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    expect(screen.getByTestId('restore-btn')).toBeDefined()
  })

  it('calls restoreFile.mutate when restore is invoked', () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>
    )
    screen.getByTestId('restore-btn').click()
    expect(mockRestoreMutate).toHaveBeenCalledWith('trash-1')
  })
})
