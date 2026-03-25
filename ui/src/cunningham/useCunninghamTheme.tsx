import { create } from 'zustand'

const defaultTheme = import.meta.env.VITE_CUNNINGHAM_THEME ?? 'default'

interface ThemeState {
  theme: string
  setTheme: (theme: string) => void
  toggle: () => void
}

const getStoredTheme = (): string => {
  try {
    return localStorage.getItem('cunningham-theme') ?? defaultTheme
  } catch {
    return defaultTheme
  }
}

export const useCunninghamTheme = create<ThemeState>((set, get) => ({
  theme: getStoredTheme(),
  setTheme: (theme: string) => {
    localStorage.setItem('cunningham-theme', theme)
    set({ theme })
  },
  toggle: () => {
    const current = get().theme
    const next = current.endsWith('-dark')
      ? current.replace('-dark', '-light')
      : current === 'dark'
        ? 'default'
        : current === 'default'
          ? 'dark'
          : current.replace('-light', '-dark')
    localStorage.setItem('cunningham-theme', next)
    set({ theme: next })
  },
}))
