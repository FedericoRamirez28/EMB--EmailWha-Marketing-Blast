import React, { useCallback, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { AuthContext, STORAGE_KEY, type AuthContextValue, type AuthUser } from './authContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  const [user, setUser] = useState<AuthUser | null>(null)

  // como leemos sync en el initializer, ya está “listo”
  const isReady = true

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // noop
    }
    setToken(null)
    setUser(null)
  }, [])

  const refreshMe = useCallback(
    async (forcedToken?: string) => {
      const t = forcedToken ?? token
      if (!t) return

      try {
        const me = await api.get<AuthUser>('/auth/me', t)
        setUser(me)
      } catch {
        logout()
      }
    },
    [token, logout],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ access_token: string }>('/auth/login', { email, password })
      const newToken = res.access_token

      try {
        localStorage.setItem(STORAGE_KEY, newToken)
      } catch {
        // noop
      }

      setToken(newToken)
      await refreshMe(newToken)
    },
    [refreshMe],
  )

  const value = useMemo<AuthContextValue>(() => {
    return {
      token,
      user,
      isReady,
      isAuthed: Boolean(token),
      login,
      logout,
      refreshMe,
    }
  }, [token, user, isReady, login, logout, refreshMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
