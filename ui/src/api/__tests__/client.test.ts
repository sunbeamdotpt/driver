import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to test the real api client, so we mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// Import after setting up fetch mock
const { api } = await import('../client')

describe('api client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('calls fetch with GET and correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      })

      const result = await api.get('/files')
      expect(mockFetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }))
      expect(result).toEqual({ data: 'test' })
    })
  })

  describe('post', () => {
    it('calls fetch with POST method and JSON body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1' }),
      })

      await api.post('/files', { filename: 'test.txt' })
      expect(mockFetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ filename: 'test.txt' }),
      }))
    })

    it('sends POST without body when none provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      await api.post('/files')
      expect(mockFetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({
        method: 'POST',
        body: undefined,
      }))
    })
  })

  describe('put', () => {
    it('calls fetch with PUT method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      await api.put('/files/123', { filename: 'new.txt' })
      expect(mockFetch).toHaveBeenCalledWith('/api/files/123', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ filename: 'new.txt' }),
      }))
    })
  })

  describe('patch', () => {
    it('calls fetch with PATCH method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      await api.patch('/files/123', { filename: 'patched.txt' })
      expect(mockFetch).toHaveBeenCalledWith('/api/files/123', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ filename: 'patched.txt' }),
      }))
    })
  })

  describe('delete', () => {
    it('calls fetch with DELETE method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await api.delete('/files/123')
      expect(mockFetch).toHaveBeenCalledWith('/api/files/123', expect.objectContaining({
        method: 'DELETE',
      }))
      expect(result).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Resource not found'),
      })

      await expect(api.get('/files/missing')).rejects.toThrow('404 Not Found: Resource not found')
    })

    it('throws on 500 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Something went wrong'),
      })

      await expect(api.post('/files')).rejects.toThrow('500 Internal Server Error: Something went wrong')
    })
  })

  describe('204 No Content', () => {
    it('returns undefined for 204 responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const result = await api.delete('/files/123')
      expect(result).toBeUndefined()
    })
  })
})
