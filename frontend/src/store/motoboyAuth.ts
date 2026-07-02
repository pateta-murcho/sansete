import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MotoboyAuthState {
  token: string | null
  name: string | null
  login: (token: string, name: string) => void
  logout: () => void
}

export const useMotoboyAuth = create<MotoboyAuthState>()(
  persist(
    (set) => ({
      token: null,
      name: null,
      login: (token, name) => set({ token, name }),
      logout: () => set({ token: null, name: null }),
    }),
    { name: 'sonset_motoboy_auth' }
  )
)
