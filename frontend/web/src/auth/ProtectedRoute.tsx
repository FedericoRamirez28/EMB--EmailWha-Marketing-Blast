import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthed } = useAuth()
  const loc = useLocation()

  if (!isReady) {
    return (
      <div style={{ padding: 24 }}>
        <div>Cargando…</div>
      </div>
    )
  }

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }

  return <>{children}</>
}
