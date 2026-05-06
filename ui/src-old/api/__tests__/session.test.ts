import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'

const mockGet = vi.fn()

vi.mock('../client', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
  },
}))

import { useSession } from '../session'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches session from /auth/session', async () => {
    mockGet.mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', name: 'Test' },
      active: true,
    })
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith('/auth/session')
    expect(result.current.data?.user.email).toBe('test@test.com')
  })

  it('does not retry on failure', async () => {
    mockGet.mockRejectedValue(new Error('Unauthorized'))
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    // Should only have been called once (retry: false)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })
})
