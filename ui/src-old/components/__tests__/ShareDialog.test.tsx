import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ShareDialog from '../ShareDialog'
import type { FileRecord } from '../../api/files'

// Mock the api client
const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

// Mock cunningham-react Button
vi.mock('@gouvfr-lasuite/cunningham-react', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
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
}

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({})
    mockDelete.mockResolvedValue({})
  })

  it('renders the dialog with file name in heading', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    // The heading contains the file name with smart quotes
    expect(screen.getByRole('heading')).toBeDefined()
    expect(screen.getByText(/report\.docx/)).toBeDefined()
  })

  it('renders email input', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText('user@example.com')).toBeDefined()
  })

  it('renders permission select with default Viewer', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    const select = screen.getByDisplayValue('Viewer')
    expect(select).toBeDefined()
  })

  it('renders Share button', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Share')).toBeDefined()
  })

  it('renders Done button', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Done')).toBeDefined()
  })

  it('Share button is disabled when email is empty', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    const shareBtn = screen.getByText('Share')
    expect(shareBtn.hasAttribute('disabled')).toBe(true)
  })

  it('calls api.post to share when Share is clicked', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/files/file-1/share', {
        email: 'alice@example.com',
        permission: 'viewer',
      })
    })
  })

  it('shows the shared user after successful share', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'bob@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('bob@example.com')).toBeDefined()
      expect(screen.getByText('Shared with')).toBeDefined()
    })
  })

  it('shows error message when share fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Permission denied'))

    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'bad@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeDefined()
    })
  })

  it('shows generic error for non-Error throws', async () => {
    mockPost.mockRejectedValueOnce('string error')

    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'bad@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Failed to share')).toBeDefined()
    })
  })

  it('renders Remove button for shared entries', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'charlie@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeDefined()
    })
  })

  it('calls api.delete when Remove is clicked', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'charlie@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Remove'))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/files/file-1/share/charlie%40example.com')
    })
  })

  it('shows error when remove fails', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    // First share someone
    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'del@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeDefined()
    })

    // Now make delete fail
    mockDelete.mockRejectedValueOnce(new Error('Cannot remove'))
    fireEvent.click(screen.getByText('Remove'))

    await waitFor(() => {
      expect(screen.getByText('Cannot remove')).toBeDefined()
    })
  })

  it('shows generic error for non-Error remove failure', async () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'del@example.com' } })
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeDefined()
    })

    mockDelete.mockRejectedValueOnce('raw error')
    fireEvent.click(screen.getByText('Remove'))

    await waitFor(() => {
      expect(screen.getByText('Failed to remove share')).toBeDefined()
    })
  })

  it('allows changing permission level', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    const select = screen.getByDisplayValue('Viewer') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'editor' } })
    expect(select.value).toBe('editor')
  })

  it('renders labels for email and permission', () => {
    render(<ShareDialog file={mockFile} isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Email or User ID')).toBeDefined()
    expect(screen.getByText('Permission')).toBeDefined()
  })
})
