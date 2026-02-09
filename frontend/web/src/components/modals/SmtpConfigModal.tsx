import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { settingsApi, type SMTP } from '@/lib/settingsApi'
import { mailApi } from '@/lib/mailApi'

export default function SmtpConfigModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { token } = useAuth()

  const [smtp, setSmtp] = useState<SMTP>({
    host: 'mail.medic.com.ar',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
    throttleMs: 2000,
  })

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  // cargar config guardada al abrir
  useEffect(() => {
    if (!open) return
    if (!token) return

    const load = async () => {
      const saved = await settingsApi.getSetting(token, 'smtp')
      if (!saved) return
      try {
        const parsed = JSON.parse(saved) as Partial<SMTP>
        setSmtp({
          host: parsed.host ?? 'mail.medic.com.ar',
          port: typeof parsed.port === 'number' ? parsed.port : 587,
          secure: !!parsed.secure,
          user: parsed.user ?? '',
          pass: parsed.pass ?? '',
          fromName: parsed.fromName ?? '',
          fromEmail: parsed.fromEmail ?? '',
          throttleMs: typeof parsed.throttleMs === 'number' ? parsed.throttleMs : 2000,
        })
      } catch {
        /* noop */
      }
    }

    void load()
  }, [open, token])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // bloquear scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function bind<K extends keyof SMTP>(k: K) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setSmtp((prev) => ({
        ...prev,
        [k]:
          k === 'port'
            ? Number(e.target.value)
            : k === 'secure'
              ? !!e.target.checked
              : k === 'throttleMs'
                ? Number(e.target.value)
                : e.target.value,
      }))
  }

  // ✅ OJO: NO se llama "usePreset" porque ESLint lo interpreta como Hook
  function applyPreset(preset: '587' | '465') {
    if (preset === '587') setSmtp((prev) => ({ ...prev, port: 587, secure: false }))
    else setSmtp((prev) => ({ ...prev, port: 465, secure: true }))
  }

  const needsAuth = useMemo(() => /medic|smtp|office|outlook|gmail|exchange/i.test(smtp.host || ''), [smtp.host])

  async function testSmtp() {
    if (!token) return
    if (needsAuth && (!smtp.user || !smtp.pass)) {
      alert('Completá Usuario y Password.')
      return
    }

    setTesting(true)
    try {
      await mailApi.testSmtp(token, smtp)
      alert('Conexión SMTP OK')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert('Fallo SMTP: ' + msg)
    } finally {
      setTesting(false)
    }
  }

  async function saveSmtp() {
    if (!token) return
    setSaving(true)
    try {
      await settingsApi.saveSetting(token, 'smtp', JSON.stringify(smtp))
      alert('Configuración guardada.')
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert('Error al guardar: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  // ✅ wrappers sync para no-misused-promises en onClick
  function onTestClick() {
    void testSmtp()
  }
  function onSaveClick() {
    void saveSmtp()
  }

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Configurar SMTP"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="card modal smtp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h3 className="modal__title">Configurar envío (SMTP)</h3>
          <button className="btn" type="button" onClick={onClose} disabled={testing || saving}>
            Cerrar
          </button>
        </header>

        <div className="modal__content form-2col">
          <div className="span-2 presets">
            <button
              className="btn"
              type="button"
              onClick={() => applyPreset('587')}
              disabled={testing || saving}
            >
              Usar 587 TLS (STARTTLS)
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => applyPreset('465')}
              disabled={testing || saving}
            >
              Usar 465 SSL
            </button>
          </div>

          <div className="field">
            <label className="label">Host</label>
            <input className="input" value={smtp.host} onChange={bind('host')} />
            <p className="help">
              Dominio @MEDIC: <code>mail.medic.com.ar</code>
            </p>
          </div>

          <div className="field">
            <label className="label">Puerto</label>
            <input className="input" value={smtp.port} onChange={bind('port')} />
          </div>

          <div className="field field-inline span-2">
            <input id="sec-cfg" type="checkbox" checked={!!smtp.secure} onChange={bind('secure')} />
            <label htmlFor="sec-cfg" className="label-inline">
              SSL (465). Para 587 desmarcado (STARTTLS/TLS).
            </label>
          </div>

          <div className="field">
            <label className="label">Usuario</label>
            <input
              className="input"
              placeholder="usuario@medic.com.ar"
              value={smtp.user || ''}
              onChange={bind('user')}
            />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" value={smtp.pass || ''} onChange={bind('pass')} />
          </div>

          <div className="span-2">
            <div className="grid-2">
              <div className="field">
                <label className="label">From Nombre</label>
                <input className="input" value={smtp.fromName || ''} onChange={bind('fromName')} />
              </div>
              <div className="field">
                <label className="label">From Email</label>
                <input
                  className="input"
                  placeholder="alias@medic.com.ar"
                  value={smtp.fromEmail || ''}
                  onChange={bind('fromEmail')}
                />
              </div>
            </div>
          </div>

          <div className="field span-2">
            <label className="label">Delay entre mails (ms)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={smtp.throttleMs ?? 2000}
              onChange={bind('throttleMs')}
            />
            <p className="help">Sugerido: 2000–3000 ms.</p>
          </div>
        </div>

        <footer className="modal__footer">
          <button className="btn" type="button" onClick={onTestClick} disabled={testing || saving}>
            Probar SMTP
          </button>
          <button className="btn btn-primary" type="button" onClick={onSaveClick} disabled={testing || saving}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  )
}
