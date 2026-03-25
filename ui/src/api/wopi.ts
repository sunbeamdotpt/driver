import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface WopiToken {
  access_token: string
  access_token_ttl: number
  wopi_src: string
}

export interface CollaboraAction {
  name: string
  ext: string
  urlsrc: string
}

export interface CollaboraDiscovery {
  actions: CollaboraAction[]
}

export function useWopiToken(fileId: string | undefined) {
  return useMutation({
    mutationFn: () => {
      if (!fileId) throw new Error('No file ID provided')
      return api.post<WopiToken>('/wopi/token', { file_id: fileId })
    },
  })
}

export function useCollaboraDiscovery() {
  return useQuery<CollaboraDiscovery>({
    queryKey: ['collabora-discovery'],
    queryFn: () => api.get<CollaboraDiscovery>('/wopi/discovery'),
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

/**
 * Given a mimetype, find the Collabora editor URL from discovery.
 * Returns the URL template string or null if no editor is available.
 */
export function useCollaboraUrl(mimetype: string | undefined) {
  const { data: discovery } = useCollaboraDiscovery()

  if (!discovery || !mimetype) return null

  // Map mimetype to extension for discovery lookup
  const mimeToExt: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.oasis.opendocument.presentation': 'odp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
  }

  const ext = mimeToExt[mimetype]
  if (!ext) return null

  const action = discovery.actions.find(
    (a) => a.ext === ext && (a.name === 'edit' || a.name === 'view'),
  )

  return action?.urlsrc ?? null
}
