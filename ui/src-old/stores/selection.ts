import { create } from 'zustand'

interface SelectionState {
  selectedIds: Set<string>
  toggle: (id: string) => void
  select: (id: string) => void
  deselect: (id: string) => void
  clear: () => void
  selectAll: (ids: string[]) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set<string>(),

  toggle: (id: string) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedIds: next }
    }),

  select: (id: string) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      next.add(id)
      return { selectedIds: next }
    }),

  deselect: (id: string) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      next.delete(id)
      return { selectedIds: next }
    }),

  clear: () => set({ selectedIds: new Set<string>() }),

  selectAll: (ids: string[]) => set({ selectedIds: new Set(ids) }),
}))
