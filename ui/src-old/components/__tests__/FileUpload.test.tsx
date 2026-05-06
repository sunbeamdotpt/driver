import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock react-dropzone — allow isDragActive to be toggled
let mockIsDragActive = false

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(({ onDrop }: any) => ({
    getRootProps: () => ({ 'data-testid': 'dropzone-root' }),
    getInputProps: () => ({ 'data-testid': 'dropzone-input' }),
    get isDragActive() { return mockIsDragActive },
  })),
}))

// Mock react-aria-components DropZone and FileTrigger
vi.mock('react-aria-components', () => ({
  DropZone: ({ children, ...props }: any) => <div data-testid="drop-zone" {...props}>{children}</div>,
  FileTrigger: ({ children }: any) => <div data-testid="file-trigger">{children}</div>,
}))

// Mock api/files
vi.mock('../../api/files', () => ({
  useUploadFile: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  })),
}))

// Mock upload store
const mockAddUpload = vi.fn()
const mockUpdateProgress = vi.fn()
const mockMarkDone = vi.fn()
const mockMarkError = vi.fn()

vi.mock('../../stores/upload', () => ({
  useUploadStore: vi.fn(() => ({
    uploads: new Map(),
    addUpload: mockAddUpload,
    updateProgress: mockUpdateProgress,
    markDone: mockMarkDone,
    markError: mockMarkError,
  })),
}))

import FileUpload from '../FileUpload'

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children', () => {
    render(
      <FileUpload>
        <div>Child content</div>
      </FileUpload>
    )
    expect(screen.getByText('Child content')).toBeDefined()
  })

  it('renders the drop zone', () => {
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByTestId('drop-zone')).toBeDefined()
  })

  it('renders the dropzone root from react-dropzone', () => {
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByTestId('dropzone-root')).toBeDefined()
  })

  it('does not show upload progress panel when no active uploads', () => {
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.queryByText(/Uploading/)).toBeNull()
  })

  it('shows upload progress panel when there are active uploads', async () => {
    const { useUploadStore } = await import('../../stores/upload') as any
    const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
    useUploadStore.mockReturnValue({
      uploads: new Map([
        ['upload-1', { file: mockFile, progress: 50, status: 'uploading', error: null }],
      ]),
      addUpload: mockAddUpload,
      updateProgress: mockUpdateProgress,
      markDone: mockMarkDone,
      markError: mockMarkError,
    })

    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByText('Uploading 1 file')).toBeDefined()
    expect(screen.getByText('test.txt')).toBeDefined()
    expect(screen.getByText('50%')).toBeDefined()
  })

  it('shows error status for failed uploads', async () => {
    const { useUploadStore } = await import('../../stores/upload') as any
    const mockFile = new File(['content'], 'fail.txt', { type: 'text/plain' })
    useUploadStore.mockReturnValue({
      uploads: new Map([
        ['upload-1', { file: mockFile, progress: 30, status: 'error', error: 'Network error' }],
      ]),
      addUpload: mockAddUpload,
      updateProgress: mockUpdateProgress,
      markDone: mockMarkDone,
      markError: mockMarkError,
    })

    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByText('Failed')).toBeDefined()
  })

  it('shows plural text for multiple uploads', async () => {
    const { useUploadStore } = await import('../../stores/upload') as any
    const file1 = new File(['a'], 'a.txt', { type: 'text/plain' })
    const file2 = new File(['b'], 'b.txt', { type: 'text/plain' })
    useUploadStore.mockReturnValue({
      uploads: new Map([
        ['upload-1', { file: file1, progress: 50, status: 'uploading', error: null }],
        ['upload-2', { file: file2, progress: 20, status: 'uploading', error: null }],
      ]),
      addUpload: mockAddUpload,
      updateProgress: mockUpdateProgress,
      markDone: mockMarkDone,
      markError: mockMarkError,
    })

    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByText('Uploading 2 files')).toBeDefined()
  })

  it('renders the SR announcement region', () => {
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('shows drag overlay when isDragActive', () => {
    mockIsDragActive = true
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByText('Drop files to upload')).toBeDefined()
    expect(screen.getByText('Files will be uploaded to this folder')).toBeDefined()
    mockIsDragActive = false
  })

  it('hides drag overlay when not dragging', () => {
    mockIsDragActive = false
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.queryByText('Drop files to upload')).toBeNull()
  })

  it('renders file trigger', () => {
    render(
      <FileUpload>
        <div>Content</div>
      </FileUpload>
    )
    expect(screen.getByTestId('file-trigger')).toBeDefined()
  })
})
