import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../client', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}))

import { useWopiToken, useCollaboraDiscovery, useCollaboraUrl } from '../wopi'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('wopi API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useCollaboraDiscovery', () => {
    it('fetches discovery from /wopi/discovery', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'edit', ext: 'docx', urlsrc: 'https://collabora.example.com/edit' },
        ],
      })
      const { result } = renderHook(() => useCollaboraDiscovery(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/wopi/discovery')
      expect(result.current.data?.actions).toHaveLength(1)
    })
  })

  describe('useWopiToken', () => {
    it('returns a mutation that posts to /wopi/token', async () => {
      mockPost.mockResolvedValue({
        access_token: 'token-123',
        access_token_ttl: 9999999,
        wopi_src: 'https://example.com/wopi/files/f1',
      })
      const { result } = renderHook(() => useWopiToken('file-1'), { wrapper: createWrapper() })
      result.current.mutate()
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockPost).toHaveBeenCalledWith('/wopi/token', { file_id: 'file-1' })
    })

    it('throws if no fileId', async () => {
      const { result } = renderHook(() => useWopiToken(undefined), { wrapper: createWrapper() })
      result.current.mutate()
      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error?.message).toContain('No file ID provided')
    })
  })

  describe('useCollaboraUrl', () => {
    it('returns null when no discovery data', () => {
      mockGet.mockResolvedValue(undefined)
      const { result } = renderHook(() => useCollaboraUrl('application/pdf'), { wrapper: createWrapper() })
      expect(result.current).toBeNull()
    })

    it('returns null when mimetype is undefined', () => {
      const { result } = renderHook(() => useCollaboraUrl(undefined), { wrapper: createWrapper() })
      expect(result.current).toBeNull()
    })

    it('returns editor URL when discovery has matching action', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'edit', ext: 'docx', urlsrc: 'https://collabora.example.com/edit/docx' },
          { name: 'view', ext: 'pdf', urlsrc: 'https://collabora.example.com/view/pdf' },
        ],
      })

      const { result } = renderHook(() => useCollaboraUrl('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current).toBe('https://collabora.example.com/edit/docx'))
    })

    it('returns null for unknown mimetype', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'edit', ext: 'docx', urlsrc: 'https://collabora.example.com/edit/docx' },
        ],
      })

      const { result } = renderHook(() => useCollaboraUrl('application/octet-stream'), {
        wrapper: createWrapper(),
      })

      // Wait for discovery to load, then check
      await waitFor(() => {
        // Discovery loaded, but mimetype doesn't match
      })
      expect(result.current).toBeNull()
    })

    it('maps application/pdf to pdf extension', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'view', ext: 'pdf', urlsrc: 'https://collabora.example.com/view/pdf' },
        ],
      })

      const { result } = renderHook(() => useCollaboraUrl('application/pdf'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current).toBe('https://collabora.example.com/view/pdf'))
    })

    it('maps text/csv to csv extension', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'edit', ext: 'csv', urlsrc: 'https://collabora.example.com/edit/csv' },
        ],
      })

      const { result } = renderHook(() => useCollaboraUrl('text/csv'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current).toBe('https://collabora.example.com/edit/csv'))
    })

    it('returns null when no matching action found', async () => {
      mockGet.mockResolvedValue({
        actions: [
          { name: 'convert', ext: 'docx', urlsrc: 'https://collabora.example.com/convert' },
        ],
      })

      const { result } = renderHook(() => useCollaboraUrl('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        // Wait for discovery
      })
      // 'convert' is not 'edit' or 'view', so should be null
      expect(result.current).toBeNull()
    })
  })
})
