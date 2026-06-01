import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'pokemon'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialTheme = (localStorage.getItem('theme') as Theme) || 'dark'
// Apply immediately — prevents a flash of the wrong theme before React hydrates
document.documentElement.setAttribute('data-theme', initialTheme)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
}))
