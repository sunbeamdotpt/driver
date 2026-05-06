import { create } from 'zustand'

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface UploadEntry {
  file: File
  progress: number
  status: UploadStatus
  error?: string
}

interface UploadState {
  uploads: Map<string, UploadEntry>
  addUpload: (id: string, file: File) => void
  updateProgress: (id: string, progress: number) => void
  markDone: (id: string) => void
  markError: (id: string, message: string) => void
  removeUpload: (id: string) => void
  clearCompleted: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: new Map<string, UploadEntry>(),

  addUpload: (id: string, file: File) =>
    set((state) => {
      const next = new Map(state.uploads)
      next.set(id, { file, progress: 0, status: 'pending' })
      return { uploads: next }
    }),

  updateProgress: (id: string, progress: number) =>
    set((state) => {
      const next = new Map(state.uploads)
      const entry = next.get(id)
      if (entry) {
        next.set(id, { ...entry, progress, status: 'uploading' })
      }
      return { uploads: next }
    }),

  markDone: (id: string) =>
    set((state) => {
      const next = new Map(state.uploads)
      const entry = next.get(id)
      if (entry) {
        next.set(id, { ...entry, progress: 100, status: 'done' })
      }
      return { uploads: next }
    }),

  markError: (id: string, message: string) =>
    set((state) => {
      const next = new Map(state.uploads)
      const entry = next.get(id)
      if (entry) {
        next.set(id, { ...entry, status: 'error', error: message })
      }
      return { uploads: next }
    }),

  removeUpload: (id: string) =>
    set((state) => {
      const next = new Map(state.uploads)
      next.delete(id)
      return { uploads: next }
    }),

  clearCompleted: () =>
    set((state) => {
      const next = new Map(state.uploads)
      for (const [id, entry] of next) {
        if (entry.status === 'done') {
          next.delete(id)
        }
      }
      return { uploads: next }
    }),
}))
