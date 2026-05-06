import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Editor from '../Editor'

// Mock the api client
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      file: {
        id: 'file-abc',
        filename: 'report.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        parent_id: 'folder-xyz',
      },
    }),
    put: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue({
      access_token: 'wopi-token',
      access_token_ttl: Date.now() + 3600000,
      editor_url: 'https://collabora.example.com/edit?WOPISrc=test',
    }),
  },
}))

function renderEditor(fileId = 'file-abc') {
  return render(
    <MemoryRouter initialEntries={[`/edit/${fileId}`]}>
      <Routes>
        <Route path="/edit/:fileId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Editor page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    renderEditor()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('fetches file metadata using fileId from route params', async () => {
    const { api } = await import('../../api/client')
    renderEditor('file-abc')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/files/file-abc')
    })
  })

  it('renders CollaboraEditor after file loads', async () => {
    renderEditor()

    await waitFor(() => {
      expect(screen.getByTestId('collabora-iframe')).toBeDefined()
    })
  })

  it('renders full-viewport editor without header chrome', async () => {
    renderEditor()

    await waitFor(() => {
      expect(screen.getByTestId('collabora-iframe')).toBeDefined()
    })

    // Editor should NOT have our own header — Collabora provides its own toolbar
    expect(screen.queryByTestId('editor-header')).toBeNull()
  })

  it('updates last_opened on mount', async () => {
    const { api } = await import('../../api/client')
    renderEditor('file-abc')

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/files/file-abc/favorite',
        expect.objectContaining({ last_opened: expect.any(String) }),
      )
    })
  })
})
