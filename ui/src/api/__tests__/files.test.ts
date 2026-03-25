import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'

// Mock the api client
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../client', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

import {
  useFiles,
  useFile,
  useRecentFiles,
  useFavoriteFiles,
  useTrashFiles,
  useCreateFolder,
  useUploadFile,
  useUpdateFile,
  useDeleteFile,
  useRestoreFile,
  useToggleFavorite,
} from '../files'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('files API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useFiles', () => {
    it('fetches root files when no parentId', async () => {
      mockGet.mockResolvedValue({ files: [{ id: '1', filename: 'test.txt' }] })
      const { result } = renderHook(() => useFiles(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/files')
      expect(result.current.data).toEqual([{ id: '1', filename: 'test.txt' }])
    })

    it('fetches folder children when parentId provided', async () => {
      mockGet.mockResolvedValue({ files: [] })
      const { result } = renderHook(() => useFiles('folder-1'), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/folders/folder-1/children')
    })

    it('includes sort and search params', async () => {
      mockGet.mockResolvedValue({ files: [] })
      const { result } = renderHook(() => useFiles(undefined, 'name', 'report'), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/files?sort=name&search=report')
    })

    it('includes sort and search with parentId', async () => {
      mockGet.mockResolvedValue({ files: [] })
      const { result } = renderHook(() => useFiles('f1', 'date', 'query'), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/folders/f1/children?sort=date&search=query')
    })

    it('unwraps array response', async () => {
      mockGet.mockResolvedValue([{ id: '1' }])
      const { result } = renderHook(() => useFiles(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual([{ id: '1' }])
    })
  })

  describe('useFile', () => {
    it('fetches single file', async () => {
      mockGet.mockResolvedValue({ file: { id: 'f1', filename: 'test.txt' } })
      const { result } = renderHook(() => useFile('f1'), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/files/f1')
      expect(result.current.data).toEqual({ id: 'f1', filename: 'test.txt' })
    })

    it('does not fetch when id is undefined', () => {
      const { result } = renderHook(() => useFile(undefined), { wrapper: createWrapper() })
      expect(result.current.isFetching).toBe(false)
    })

    it('unwraps non-wrapped response', async () => {
      mockGet.mockResolvedValue({ id: 'f1', filename: 'direct.txt' })
      const { result } = renderHook(() => useFile('f1'), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual({ id: 'f1', filename: 'direct.txt' })
    })
  })

  describe('useRecentFiles', () => {
    it('fetches recent files', async () => {
      mockGet.mockResolvedValue({ files: [{ id: 'r1' }] })
      const { result } = renderHook(() => useRecentFiles(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/recent')
    })
  })

  describe('useFavoriteFiles', () => {
    it('fetches favorite files', async () => {
      mockGet.mockResolvedValue({ files: [{ id: 'fav1' }] })
      const { result } = renderHook(() => useFavoriteFiles(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/favorites')
    })
  })

  describe('useTrashFiles', () => {
    it('fetches trash files', async () => {
      mockGet.mockResolvedValue({ files: [{ id: 't1' }] })
      const { result } = renderHook(() => useTrashFiles(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGet).toHaveBeenCalledWith('/trash')
    })
  })

  describe('useCreateFolder', () => {
    it('posts to /folders', async () => {
      mockPost.mockResolvedValue({ id: 'new-folder' })
      const { result } = renderHook(() => useCreateFolder(), { wrapper: createWrapper() })
      result.current.mutate({ filename: 'New Folder', parent_id: null })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockPost).toHaveBeenCalledWith('/folders', { filename: 'New Folder', parent_id: null })
    })
  })

  describe('useUploadFile', () => {
    it('creates record, gets upload URL, and uploads', async () => {
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      mockPost
        .mockResolvedValueOnce({ id: 'new-file', filename: 'test.txt' }) // create record
        .mockResolvedValueOnce({ upload_url: 'https://s3.example.com/upload', file_id: 'new-file' }) // upload url

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      const { result } = renderHook(() => useUploadFile(), { wrapper: createWrapper() })
      result.current.mutate({ file: mockFile, parentId: 'folder-1' })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockPost).toHaveBeenCalledWith('/files', {
        filename: 'test.txt',
        mimetype: 'text/plain',
        size: 7,
        parent_id: 'folder-1',
      })
      expect(mockPost).toHaveBeenCalledWith('/files/new-file/upload-url')
    })

    it('throws when S3 upload fails', async () => {
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      mockPost
        .mockResolvedValueOnce({ id: 'new-file' })
        .mockResolvedValueOnce({ upload_url: 'https://s3.example.com/upload', file_id: 'new-file' })

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })

      const { result } = renderHook(() => useUploadFile(), { wrapper: createWrapper() })
      result.current.mutate({ file: mockFile })
      await waitFor(() => expect(result.current.isError).toBe(true))
    })
  })

  describe('useUpdateFile', () => {
    it('puts to /files/:id', async () => {
      mockPut.mockResolvedValue({ id: 'f1', filename: 'renamed.txt' })
      const { result } = renderHook(() => useUpdateFile(), { wrapper: createWrapper() })
      result.current.mutate({ id: 'f1', filename: 'renamed.txt' })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockPut).toHaveBeenCalledWith('/files/f1', { filename: 'renamed.txt' })
    })
  })

  describe('useDeleteFile', () => {
    it('deletes /files/:id', async () => {
      mockDelete.mockResolvedValue(undefined)
      const { result } = renderHook(() => useDeleteFile(), { wrapper: createWrapper() })
      result.current.mutate('f1')
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockDelete).toHaveBeenCalledWith('/files/f1')
    })
  })

  describe('useRestoreFile', () => {
    it('posts to /files/:id/restore', async () => {
      mockPost.mockResolvedValue({ id: 'f1' })
      const { result } = renderHook(() => useRestoreFile(), { wrapper: createWrapper() })
      result.current.mutate('f1')
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockPost).toHaveBeenCalledWith('/files/f1/restore')
    })
  })

  describe('useToggleFavorite', () => {
    it('puts to /files/:id/favorite', async () => {
      mockPut.mockResolvedValue(undefined)
      const { result } = renderHook(() => useToggleFavorite(), { wrapper: createWrapper() })
      result.current.mutate('f1')
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockPut).toHaveBeenCalledWith('/files/f1/favorite')
    })
  })
})
