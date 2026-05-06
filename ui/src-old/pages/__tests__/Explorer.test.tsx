import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Explorer from '../Explorer'

// Mock the api hooks
const mockCreateFolderMutate = vi.fn()

vi.mock('../../api/files', () => ({
  useFiles: vi.fn(() => ({
    data: [
      {
        id: 'file-1',
        filename: 'report.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024,
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
  useCreateFolder: vi.fn(() => ({ mutate: mockCreateFolderMutate })),
  useFile: vi.fn(() => ({ data: undefined })),
}))

// Mock child components to simplify
vi.mock('../../components/BreadcrumbNav', () => ({
  default: () => <nav data-testid="breadcrumb-nav">BreadcrumbNav</nav>,
}))

vi.mock('../../components/FileBrowser', () => ({
  default: ({ files, isLoading }: any) => (
    <div data-testid="file-browser">
      {isLoading ? 'Loading...' : `${files.length} files`}
    </div>
  ),
}))

vi.mock('../../components/FileUpload', () => ({
  default: ({ children }: any) => <div data-testid="file-upload">{children}</div>,
}))

function renderExplorer(path = '/explorer') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explorer" element={<Explorer />} />
        <Route path="/explorer/:folderId" element={<Explorer />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Explorer page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders BreadcrumbNav', () => {
    renderExplorer()
    expect(screen.getByTestId('breadcrumb-nav')).toBeDefined()
  })

  it('renders FileBrowser with files', () => {
    renderExplorer()
    expect(screen.getByTestId('file-browser')).toBeDefined()
    expect(screen.getByText('1 files')).toBeDefined()
  })

  it('renders FileUpload wrapper', () => {
    renderExplorer()
    expect(screen.getByTestId('file-upload')).toBeDefined()
  })

  it('renders New Folder button', () => {
    renderExplorer()
    expect(screen.getByText('New Folder')).toBeDefined()
  })

  it('renders Upload button', () => {
    renderExplorer()
    expect(screen.getByText('Upload')).toBeDefined()
  })

  it('shows new folder form when New Folder button clicked', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    expect(screen.getByPlaceholderText('Folder name')).toBeDefined()
    expect(screen.getByText('Create')).toBeDefined()
    expect(screen.getByText('Cancel')).toBeDefined()
  })

  it('calls createFolder.mutate when Create is clicked', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    const input = screen.getByPlaceholderText('Folder name')
    fireEvent.change(input, { target: { value: 'My New Folder' } })
    fireEvent.click(screen.getByText('Create'))
    expect(mockCreateFolderMutate).toHaveBeenCalledWith({
      name: 'My New Folder',
      parent_id: null,
    })
  })

  it('does not call createFolder when folder name is empty', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    fireEvent.click(screen.getByText('Create'))
    expect(mockCreateFolderMutate).not.toHaveBeenCalled()
  })

  it('hides new folder form when Cancel is clicked', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    expect(screen.getByPlaceholderText('Folder name')).toBeDefined()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Folder name')).toBeNull()
  })

  it('creates folder on Enter key', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    const input = screen.getByPlaceholderText('Folder name')
    fireEvent.change(input, { target: { value: 'Enter Folder' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCreateFolderMutate).toHaveBeenCalledWith({
      name: 'Enter Folder',
      parent_id: null,
    })
  })

  it('hides new folder form on Escape key', () => {
    renderExplorer()
    fireEvent.click(screen.getByText('New Folder'))
    const input = screen.getByPlaceholderText('Folder name')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Folder name')).toBeNull()
  })
})
