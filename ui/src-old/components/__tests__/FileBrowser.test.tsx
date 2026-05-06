import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FileBrowser from '../FileBrowser'
import type { FileRecord } from '../../api/files'
import { useSelectionStore } from '../../stores/selection'

// Mock FileActions to avoid complex rendering
vi.mock('../FileActions', () => ({
  default: ({ file, onClose }: { file: FileRecord; onClose: () => void }) => (
    <div data-testid="file-actions">{file.filename}<button onClick={onClose}>close</button></div>
  ),
}))

const mockFile = (overrides: Partial<FileRecord> = {}): FileRecord => ({
  id: 'file-1',
  s3_key: 's3/file-1',
  filename: 'test.docx',
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 12345,
  owner_id: 'user-12345678-abcd',
  parent_id: null,
  is_folder: false,
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
  deleted_at: null,
  favorited: false,
  ...overrides,
})

const mockFolder = (overrides: Partial<FileRecord> = {}): FileRecord => ({
  ...mockFile(),
  id: 'folder-1',
  filename: 'Documents',
  is_folder: true,
  mimetype: '',
  size: 0,
  ...overrides,
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('FileBrowser', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: new Set() })
  })

  it('shows loading state when isLoading is true', () => {
    renderWithRouter(<FileBrowser files={[]} isLoading={true} />)
    expect(screen.getByText('Loading files...')).toBeDefined()
  })

  it('shows empty state when files array is empty', () => {
    renderWithRouter(<FileBrowser files={[]} />)
    expect(screen.getByText('No files here yet')).toBeDefined()
  })

  it('shows trash empty state when isTrash and no files', () => {
    renderWithRouter(<FileBrowser files={[]} isTrash />)
    expect(screen.getByText('Trash is empty')).toBeDefined()
  })

  it('renders file names', () => {
    const files = [mockFile({ filename: 'report.docx' })]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByText('report.docx')).toBeDefined()
  })

  it('renders folder names with folder icon text', () => {
    const files = [mockFolder({ filename: 'My Folder' })]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByText('My Folder')).toBeDefined()
    expect(screen.getByText('Folder')).toBeDefined()
  })

  it('sorts folders before files', () => {
    const files = [
      mockFile({ id: 'f1', filename: 'zebra.txt', mimetype: 'text/plain' }),
      mockFolder({ id: 'f2', filename: 'Alpha Folder' }),
    ]
    renderWithRouter(<FileBrowser files={files} />)
    // Both should render
    expect(screen.getByText('Alpha Folder')).toBeDefined()
    expect(screen.getByText('zebra.txt')).toBeDefined()
  })

  it('renders column headers', () => {
    const files = [mockFile()]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Type')).toBeDefined()
    expect(screen.getByText('Size')).toBeDefined()
    expect(screen.getByText('Modified')).toBeDefined()
    expect(screen.getByText('Owner')).toBeDefined()
  })

  it('renders owner id truncated to 8 chars', () => {
    const files = [mockFile({ owner_id: 'user-12345678-abcd' })]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByText('user-123')).toBeDefined()
  })

  it('renders file browser grid list with aria label', () => {
    const files = [mockFile()]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByRole('grid', { name: 'File browser' })).toBeDefined()
  })

  it('renders trash grid list with trash aria label', () => {
    const files = [mockFile()]
    const onRestore = vi.fn()
    renderWithRouter(<FileBrowser files={files} isTrash onRestore={onRestore} />)
    expect(screen.getByRole('grid', { name: 'Trash files' })).toBeDefined()
  })

  it('renders restore button when isTrash and onRestore provided', () => {
    const files = [mockFile()]
    const onRestore = vi.fn()
    renderWithRouter(<FileBrowser files={files} isTrash onRestore={onRestore} />)
    expect(screen.getByText('Restore')).toBeDefined()
  })

  it('calls onRestore when restore button clicked', () => {
    const files = [mockFile({ id: 'file-to-restore' })]
    const onRestore = vi.fn()
    renderWithRouter(<FileBrowser files={files} isTrash onRestore={onRestore} />)
    fireEvent.click(screen.getByText('Restore'))
    expect(onRestore).toHaveBeenCalledWith('file-to-restore')
  })

  it('shows relative date for recently modified files', () => {
    const now = new Date()
    const files = [mockFile({ updated_at: now.toISOString() })]
    renderWithRouter(<FileBrowser files={files} />)
    expect(screen.getByText('Just now')).toBeDefined()
  })

  it('shows empty help text for non-trash empty state', () => {
    renderWithRouter(<FileBrowser files={[]} />)
    expect(screen.getByText('Drop files anywhere to upload, or use the buttons above.')).toBeDefined()
  })

  it('shows trash help text for trash empty state', () => {
    renderWithRouter(<FileBrowser files={[]} isTrash />)
    expect(screen.getByText('Deleted files will appear here.')).toBeDefined()
  })

  it('renders dash for folder with zero size', () => {
    const files = [mockFolder({ size: 0 })]
    renderWithRouter(<FileBrowser files={files} />)
    // The dash character \u2014
    expect(screen.getByText('\u2014')).toBeDefined()
  })
})
