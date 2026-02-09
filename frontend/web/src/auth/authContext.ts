import { createContext } from 'react'

export type AuthUser = {
  id: string
  email: string
  name?: string | null
}

export type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  isReady: boolean
  isAuthed: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: (forcedToken?: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const STORAGE_KEY = 'emb_token'
