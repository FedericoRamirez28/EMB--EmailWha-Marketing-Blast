import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

type LocState = { from?: string }

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (typeof err === 'string' && err.trim()) return err
  if (typeof err === 'object' && err !== null) {
    const maybe = (err as Record<string, unknown>).message
    if (typeof maybe === 'string' && maybe.trim()) return maybe
  }
  return 'No se pudo iniciar sesión'
}

export function LoginScreen() {
  const { login, isAuthed } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as LocState | null)?.from ?? '/'

  const [email, setEmail] = useState('admin@emb.local')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length > 2, [email, password])

  useEffect(() => {
    if (isAuthed) void nav(from, { replace: true })
  }, [isAuthed, nav, from])

  async function submit() {
    if (!canSubmit) return
    setErr(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      void nav(from, { replace: true })
    } catch (e: unknown) {
      setErr(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  // ✅ handler NO async para JSX (evita no-misused-promises)
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void submit()
  }

  if (isAuthed) return null

  return (
    <div className="loginWrap">
      <form className="loginCard" onSubmit={handleSubmit}>
        <div className="loginBrand">
          <div className="loginLogo">EMB</div>
          <div>
            <div className="loginTitle">Iniciar sesión</div>
            <div className="loginSub">Entorno web</div>
          </div>
        </div>

        <label className="loginLabel">
          Email
          <input
            className="loginInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="loginLabel">
          Contraseña
          <input
            className="loginInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {err && <div className="loginError">{err}</div>}

        <button className="loginBtn" type="submit" disabled={!canSubmit || loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
