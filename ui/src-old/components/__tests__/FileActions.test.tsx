import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FileRecord } from '../../api/files'

// Mock the API hooks
const mockDeleteMutate = vi.fn()
const mockToggleFavoriteMutate = vi.fn()
const mockUpdateFileMutate = vi.fn()

vi.mock('../../api/files', () => ({
  useDeleteFile: vi.fn(() => ({ mutate: mockDeleteMutate })),
  useToggleFavorite: vi.fn(() => ({ mutate: mockToggleFavoriteMutate })),
  useUpdateFile: vi.fn(() => ({ mutate: mockUpdateFileMutate })),
}))

// Mock cunningham-react Modal and Button
vi.mock('@gouvfr-lasuite/cunningham-react', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  Modal: ({ children, title, isOpen, actions }: any) => (
    isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}{actions}</div> : null
  ),
  ModalSize: { SMALL: 'small', MEDIUM: 'medium' },
}))

// Mock react-aria-components Menu, MenuItem, Separator to avoid keyboard handler issues
let capturedOnAction: ((key: React.Key) => void) | null = null

vi.mock('react-aria-components', () => ({
  Menu: ({ children, onAction, 'aria-label': ariaLabel, onClose, ...props }: any) => {
    capturedOnAction = onAction
    return <div role="menu" aria-label={ariaLabel} {...props}>{children}</div>
  },
  MenuItem: ({ children, id, textValue, style, ...props }: any) => (
    <div role="menuitem" data-id={id} onClick={() => capturedOnAction?.(id)} {...props}>
      {typeof children === 'function' ? children({ isFocused: false }) : children}
    </div>
  ),
  Separator: (props: any) => <hr {...props} />,
}))

const mockFile: FileRecord = {
  id: 'file-1',
  s3_key: 's3/file-1',
  filename: 'report.docx',
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 12345,
  owner_id: 'user-123',
  parent_id: null,
  is_folder: false,
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
  deleted_at: null,
  favorited: false,
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// Import after mocks
import FileActions from '../FileActions'

describe('FileActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnAction = null
  })

  it('renders the File actions menu', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} position={{ x: 100, y: 200 }} />
    )
    expect(screen.getByRole('menu', { name: 'File actions' })).toBeDefined()
  })

  it('shows Download menu item for non-trash files', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    expect(screen.getByText('Download')).toBeDefined()
  })

  it('shows Open in Collabora for editable documents', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    expect(screen.getByText('Open in Collabora')).toBeDefined()
  })

  it('does not show Open in Collabora for non-editable files', () => {
    const imageFile = { ...mockFile, filename: 'photo.png', mimetype: 'image/png' }
    renderWithRouter(
      <FileActions file={imageFile} onClose={vi.fn()} />
    )
    expect(screen.queryByText('Open in Collabora')).toBeNull()
  })

  it('shows Rename, Move, and Delete', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    expect(screen.getByText('Rename')).toBeDefined()
    expect(screen.getByText('Move')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()
  })

  it('shows Add to favorites when not favorited', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    expect(screen.getByText('Add to favorites')).toBeDefined()
  })

  it('shows Remove from favorites when favorited', () => {
    const favFile = { ...mockFile, favorited: true }
    renderWithRouter(
      <FileActions file={favFile} onClose={vi.fn()} />
    )
    expect(screen.getByText('Remove from favorites')).toBeDefined()
  })

  it('hides non-trash items in trash mode', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} isTrash />
    )
    expect(screen.queryByText('Download')).toBeNull()
    expect(screen.queryByText('Rename')).toBeNull()
    expect(screen.queryByText('Move')).toBeNull()
    expect(screen.queryByText('Add to favorites')).toBeNull()
    expect(screen.getByText('Delete')).toBeDefined()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = renderWithRouter(
      <FileActions file={mockFile} onClose={onClose} />
    )
    const backdrop = container.querySelector('div[style*="position: fixed"]')
    if (backdrop) fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not show Download for folders', () => {
    const folder = { ...mockFile, is_folder: true, filename: 'My Folder' }
    renderWithRouter(
      <FileActions file={folder} onClose={vi.fn()} />
    )
    expect(screen.queryByText('Download')).toBeNull()
  })

  it('opens rename modal when rename action fires', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    // Click the Rename menu item
    fireEvent.click(screen.getByText('Rename'))
    expect(screen.getByTestId('modal')).toBeDefined()
    expect(screen.getByDisplayValue('report.docx')).toBeDefined()
  })

  it('opens delete confirm modal when delete action fires', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/Are you sure you want to delete/)).toBeDefined()
  })

  it('calls deleteFile.mutate when delete is confirmed', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Delete'))
    // In the modal, click the Delete button (there are two - the menu item and the modal button)
    const deleteButtons = screen.getAllByText('Delete')
    // The last one is the modal confirm button
    fireEvent.click(deleteButtons[deleteButtons.length - 1])
    expect(mockDeleteMutate).toHaveBeenCalledWith('file-1')
  })

  it('calls toggleFavorite when favorite action fires', () => {
    const onClose = vi.fn()
    renderWithRouter(
      <FileActions file={mockFile} onClose={onClose} />
    )
    fireEvent.click(screen.getByText('Add to favorites'))
    expect(mockToggleFavoriteMutate).toHaveBeenCalledWith('file-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens move modal when move action fires', () => {
    renderWithRouter(
      <FileActions file={mockFile} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Move'))
    expect(screen.getByText('Move to...')).toBeDefined()
    expect(screen.getByText(/Folder tree selector/)).toBeDefined()
  })
})
