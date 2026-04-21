import { create } from 'zustand'
import axios from 'axios'

interface User {
  id: number
  username: string
  email?: string
  roles: string
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  hasRole: (role: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  login: async (username, password) => {
    const resp = await axios.post('/auth/login', { username, password }, { withCredentials: true })
    set({ user: resp.data.user })
  },

  logout: async () => {
    await axios.post('/auth/logout', {}, { withCredentials: true })
    set({ user: null })
  },

  fetchMe: async () => {
    set({ loading: true })
    try {
      const resp = await axios.get('/auth/me', { withCredentials: true })
      set({ user: resp.data })
    } catch {
      set({ user: null })
    } finally {
      set({ loading: false })
    }
  },

  hasRole: (role) => {
    const { user } = get()
    if (!user) return false
    return user.roles.split(',').includes(role)
  },
}))
