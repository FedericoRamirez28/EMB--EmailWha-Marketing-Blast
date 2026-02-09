import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

export function AppShell() {
  const { logout, user } = useAuth()
  const nav = useNavigate()

  function handleLogout(): void {
    void logout()
    void nav('/login', { replace: true })
  }

  function goHome(): void {
    void nav('/', { replace: true })
  }

  return (
    <div className="appShell">
      <header className="appShell__topbar">
        <button className="appShell__brand" type="button" onClick={goHome} aria-label="Ir al dashboard">
          EMB
        </button>

        <nav className="appShell__tabs" aria-label="Secciones">
          <NavLink to="/" end className={({ isActive }) => `appShell__tab ${isActive ? 'is-active' : ''}`}>
            Email
          </NavLink>

          <NavLink to="/recipients" className={({ isActive }) => `appShell__tab ${isActive ? 'is-active' : ''}`}>
            Destinatarios
          </NavLink>

          <NavLink to="/whatsapp" className={({ isActive }) => `appShell__tab ${isActive ? 'is-active' : ''}`}>
            WhatsApp
          </NavLink>
        </nav>

        <div className="appShell__right">
          <span className="appShell__user">{user?.email ?? '—'}</span>
          <button className="appShell__btn" type="button" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>

      <main className="appShell__main">
        <Outlet />
      </main>
    </div>
  )
}
