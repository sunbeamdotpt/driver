import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface SessionUser {
  id: string
  email: string
  name: string
  picture?: string
}

export interface Session {
  user: SessionUser
  active: boolean
}

export function useSession() {
  return useQuery<Session>({
    queryKey: ['session'],
    queryFn: () => api.get<Session>('/auth/session'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
