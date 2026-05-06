import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface FileRecord {
  id: string
  s3_key: string
  filename: string
  mimetype: string
  size: number
  owner_id: string
  parent_id: string | null
  is_folder: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  favorited?: boolean
  last_opened?: string | null
}

export interface CreateFolderPayload {
  name: string
  parent_id?: string | null
}

export interface UpdateFilePayload {
  filename?: string
  parent_id?: string | null
}

export interface UploadUrlResponse {
  upload_url: string
  file_id: string
}

// Server wraps arrays in { files: [...] } and single items in { file: {...} }
function unwrapFiles(data: { files: FileRecord[] } | FileRecord[]): FileRecord[] {
  return Array.isArray(data) ? data : data.files ?? []
}
function unwrapFile(data: { file: FileRecord } | FileRecord): FileRecord {
  return 'file' in data ? data.file : data
}

// ---------- Queries ----------

export function useFiles(parentId?: string, sort?: string, search?: string) {
  return useQuery<FileRecord[]>({
    queryKey: ['files', { parentId, sort, search }],
    queryFn: async () => {
      if (parentId) {
        const params = new URLSearchParams()
        if (sort) params.set('sort', sort)
        if (search) params.set('search', search)
        const qs = params.toString()
        return unwrapFiles(await api.get(`/folders/${parentId}/children${qs ? `?${qs}` : ''}`))
      }
      const params = new URLSearchParams()
      if (sort) params.set('sort', sort)
      if (search) params.set('search', search)
      const qs = params.toString()
      return unwrapFiles(await api.get(`/files${qs ? `?${qs}` : ''}`))
    },
  })
}

export function useFile(id: string | undefined) {
  return useQuery<FileRecord>({
    queryKey: ['file', id],
    queryFn: async () => unwrapFile(await api.get(`/files/${id}`)),
    enabled: !!id,
  })
}

export function useRecentFiles() {
  return useQuery<FileRecord[]>({
    queryKey: ['recent'],
    queryFn: async () => unwrapFiles(await api.get('/recent')),
  })
}

export function useFavoriteFiles() {
  return useQuery<FileRecord[]>({
    queryKey: ['favorites'],
    queryFn: async () => unwrapFiles(await api.get('/favorites')),
  })
}

export function useTrashFiles() {
  return useQuery<FileRecord[]>({
    queryKey: ['trash'],
    queryFn: async () => unwrapFiles(await api.get('/trash')),
  })
}

// ---------- Mutations ----------

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateFolderPayload) =>
      api.post<FileRecord>('/folders', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
    },
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, parentId }: { file: File; parentId?: string }) => {
      // Step 1: create file metadata record
      const record = await api.post<FileRecord>('/files', {
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        size: file.size,
        parent_id: parentId || null,
      })

      // Step 2: get pre-signed upload URL
      const { upload_url } = await api.post<UploadUrlResponse>(
        `/files/${record.id}/upload-url`,
      )

      // Step 3: upload directly to S3 via pre-signed URL
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`)
      }

      return record
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
    },
  })
}

export function useUpdateFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateFilePayload & { id: string }) =>
      api.put<FileRecord>(`/files/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['file'] })
    },
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/files/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useRestoreFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<FileRecord>(`/files/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put<void>(`/files/${id}/favorite`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['favorites'] })
      qc.invalidateQueries({ queryKey: ['file'] })
    },
  })
}
