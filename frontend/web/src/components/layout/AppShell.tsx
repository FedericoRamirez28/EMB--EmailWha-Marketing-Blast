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
        <div className="appShell__left">
          <button
            className="appShell__brand"
            type="button"
            onClick={goHome}
            aria-label="Ir al home"
          >
            <span className="appShell__brandIcon">M</span>
            <span className="appShell__brandText">MEDIC Ventas</span>
          </button>

          <nav className="appShell__tabs" aria-label="Secciones">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `appShell__tab ${isActive ? 'is-active' : ''}`
              }
            >
              Home
            </NavLink>

            <NavLink
              to="/contratos"
              className={({ isActive }) =>
                `appShell__tab ${isActive ? 'is-active' : ''}`
              }
            >
              Mis contratos
            </NavLink>
            <NavLink
  to="/planes"
  className={({ isActive }) =>
    `appShell__tab ${isActive ? 'is-active' : ''}`
  }
>
  Mis planes
</NavLink>

            <NavLink
  to="/vendedores"
  className={({ isActive }) =>
    `appShell__tab ${isActive ? 'is-active' : ''}`
  }
>
  Mis vendedores
</NavLink>

<NavLink
  to="/metricas"
  className={({ isActive }) =>
    `appShell__tab ${isActive ? 'is-active' : ''}`
  }
>
  Mis métricas
</NavLink>

            <NavLink
              to="/email"
              className={({ isActive }) =>
                `appShell__tab ${isActive ? 'is-active' : ''}`
              }
            >
              Email
            </NavLink>

            <NavLink
              to="/whatsapp"
              className={({ isActive }) =>
                `appShell__tab ${isActive ? 'is-active' : ''}`
              }
            >
              WhatsApp
            </NavLink>
          </nav>
        </div>

        <div className="appShell__right">
          <span className="appShell__user">{user?.email ?? 'sistemas'}</span>

          <button className="appShell__btn" type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="appShell__main">
        <div className="appShell__outlet">
          <Outlet />
        </div>
      </main>
    </div>
  )
}