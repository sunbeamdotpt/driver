import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CollaboraEditor from '../CollaboraEditor'

// Mock the api client — use snake_case response matching server
vi.mock('../../api/client', () => ({
  api: {
    post: vi.fn().mockResolvedValue({
      access_token: 'test-wopi-token-abc123',
      access_token_ttl: Date.now() + 3600000,
      editor_url: 'https://collabora.example.com/loleaflet/dist/loleaflet.html?WOPISrc=https%3A%2F%2Fdrive.example.com%2Fwopi%2Ffiles%2Ffile-123',
    }),
  },
}))

describe('CollaboraEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an iframe with name collabora_frame', () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    const iframe = screen.getByTestId('collabora-iframe')
    expect(iframe).toBeDefined()
    expect(iframe.getAttribute('name')).toBe('collabora_frame')
  })

  it('shows loading state initially', () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    expect(screen.getByTestId('collabora-loading')).toBeDefined()
  })

  it('creates a form with correct action and token after fetching WOPI data', async () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    await waitFor(() => {
      const form = screen.getByTestId('collabora-form')
      expect(form).toBeDefined()
      expect(form.getAttribute('action')).toContain('collabora.example.com')
      expect(form.getAttribute('target')).toBe('collabora_frame')
      expect(form.getAttribute('method')).toBe('post')
    })

    const tokenInput = document.querySelector('input[name="access_token"]') as HTMLInputElement
    expect(tokenInput).toBeDefined()
    expect(tokenInput.value).toBe('test-wopi-token-abc123')

    const ttlInput = document.querySelector('input[name="access_token_ttl"]') as HTMLInputElement
    expect(ttlInput).toBeDefined()
  })

  it('calls api.post with correct file_id', async () => {
    const { api } = await import('../../api/client')

    render(<CollaboraEditor fileId="file-456" fileName="test.xlsx" mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/wopi/token', { file_id: 'file-456' })
    })
  })

  it('handles postMessage for Document_Loaded', async () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          MessageId: 'App_LoadingStatus',
          Values: { Status: 'Document_Loaded' },
        }),
      }),
    )

    await waitFor(() => {
      expect(screen.queryByTestId('collabora-loading')).toBeNull()
    })
  })

  it('calls onClose when UI_Close message is received', async () => {
    const onClose = vi.fn()
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onClose={onClose} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ MessageId: 'UI_Close' }),
      }),
    )

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('handles Action_Save message', async () => {
    const onSaveStatus = vi.fn()
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onSaveStatus={onSaveStatus} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ MessageId: 'Action_Save' }),
      }),
    )

    await waitFor(() => {
      expect(onSaveStatus).toHaveBeenCalledWith(true)
    })
  })

  it('handles Action_Save_Resp message', async () => {
    const onSaveStatus = vi.fn()
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onSaveStatus={onSaveStatus} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ MessageId: 'Action_Save_Resp' }),
      }),
    )

    await waitFor(() => {
      expect(onSaveStatus).toHaveBeenCalledWith(false)
    })
  })

  it('ignores invalid JSON in postMessage', () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    // Should not throw
    window.dispatchEvent(
      new MessageEvent('message', { data: 'not json' }),
    )
  })

  it('ignores messages without MessageId', () => {
    render(<CollaboraEditor fileId="file-123" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    window.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ foo: 'bar' }) }),
    )
  })

  it('renders error state when token fetch fails', async () => {
    const { api } = await import('../../api/client')
    ;(api.post as any).mockRejectedValueOnce(new Error('Token fetch failed'))

    render(<CollaboraEditor fileId="file-err" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load editor')).toBeDefined()
      expect(screen.getByText('Token fetch failed')).toBeDefined()
    })
  })

  it('renders error with fallback message for non-Error', async () => {
    const { api } = await import('../../api/client')
    ;(api.post as any).mockRejectedValueOnce('string error')

    render(<CollaboraEditor fileId="file-err2" fileName="test.docx" mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to get editor token')).toBeDefined()
    })
  })
})
