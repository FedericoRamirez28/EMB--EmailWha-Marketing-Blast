import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

type NavKeyVentas = 'home' | 'email' | 'whatsapp'

const NAV_ITEMS: { key: NavKeyVentas; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'email', label: 'Email', path: '/email' },
  { key: 'whatsapp', label: 'WhatsApp', path: '/whatsapp' },
]

function getSelected(pathname: string): NavKeyVentas {
  if (pathname.startsWith('/email')) return 'email'
  if (pathname.startsWith('/recipients')) return 'email'
  if (pathname.startsWith('/whatsapp')) return 'whatsapp'
  return 'home'
}

export function TopNavbarVentas() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()

  const selected = getSelected(loc.pathname)

  function handleLogout(): void {
    void logout()
    void nav('/login', { replace: true })
  }

  function goTo(path: string): void {
    void nav(path)
  }

  return (
    <header className="topnav">
      <div className="topnav__left">
        <button className="topnav__logo" type="button" onClick={() => goTo('/')}>
          <span className="topnav__logo-mark">M</span>
          <span className="topnav__logo-text">MEDIC Ventas</span>
        </button>

        <nav className="topnav__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                'topnav__nav-item' +
                (selected === item.key ? ' topnav__nav-item--active' : '')
              }
              onClick={() => goTo(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="topnav__right">
        <span className="topnav__user">{user?.email ?? 'sistemas'}</span>

        <button className="topnav__logout" type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}