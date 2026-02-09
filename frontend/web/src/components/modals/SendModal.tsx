import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { settingsApi, type SMTP } from '@/lib/settingsApi'
import { mailApi, type JobProgress } from '@/lib/mailApi'

type Recipient = { id: number; name?: string; email: string }

export default function SendModal({
  open,
  onClose,
  recipients,
  message,
  attachmentIds = [],
}: {
  open: boolean
  onClose: () => void
  recipients: Recipient[]
  message: { subject: string; html: string; attachments: { path: string }[] } // compat
  attachmentIds?: number[]
}) {
  const { token } = useAuth()

  const [smtp, setSmtp] = useState<SMTP>({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
    throttleMs: 1500,
  })

  const [sending, setSending] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<JobProgress>({
    jobId: '',
    sent: 0,
    total: 0,
    to: '',
    done: false,
    error: null,
  })

  const throttle = smtp.throttleMs ?? 1500

  // cargar config al abrir
  useEffect(() => {
    if (!open) return
    if (!token) return

    const load = async () => {
      const saved = await settingsApi.getSetting(token, 'smtp')
      if (!saved) return
      try {
        setSmtp((prev) => ({ ...prev, ...(JSON.parse(saved) as Partial<SMTP>) }))
      } catch {
        /* noop */
      }
    }

    void load()
  }, [open, token])

  // ESC para cerrar (si no está enviando)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, sending])

  // bloquear scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // polling del progreso
  useEffect(() => {
    if (!token) return
    if (!open) return
    if (!jobId) return

    let alive = true
    const tick = async () => {
      try {
        const p = await mailApi.getJob(token, jobId)
        if (!alive) return
        setProgress(p)
        if (p.done) setSending(false)
      } catch {
        // si falla, no cortamos: reintenta
      }
    }

    const id = window.setInterval(() => void tick(), 600)
    void tick()

    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [token, open, jobId])

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

  const needsAuth = useMemo(
    () => /gmail|mailtrap|sendgrid|postmark|outlook|office365|smtp/i.test(smtp.host || ''),
    [smtp.host],
  )

  async function testSmtp() {
    if (!token) return
    if (needsAuth && (!smtp.user || !smtp.pass)) {
      alert('Completá Usuario y Password (Gmail: contraseña de aplicación).')
      return
    }
    try {
      await mailApi.testSmtp(token, smtp)
      alert('Conexión SMTP OK')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert('Fallo SMTP: ' + msg)
    }
  }

  async function sendNow() {
    if (!token) return
    if (!recipients.length) return

    if (needsAuth && (!smtp.user || !smtp.pass)) {
      alert('Completá Usuario y Password para enviar.')
      return
    }
    if (!message.subject?.trim()) {
      alert('Completá el asunto.')
      return
    }
    if (!message.html?.trim()) {
      alert('Completá el cuerpo HTML.')
      return
    }

    setSending(true)
    setProgress({ jobId: '', sent: 0, total: recipients.length, to: '', done: false, error: null })

    try {
      await settingsApi.saveSetting(token, 'smtp', JSON.stringify(smtp))

      const selected = recipients.map((r) => ({ name: r.name, email: r.email }))

      const started = await mailApi.startSendBulk(token, {
        smtp,
        selected,
        subject: message.subject,
        html: message.html,
        attachmentIds,
        throttleMs: throttle,
      })

      setJobId(started.jobId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSending(false)
      alert('Error al enviar: ' + msg)
    }
  }

  // ✅ wrappers sync para no-misused-promises
  function onTestClick() {
    void testSmtp()
  }
  function onSendClick() {
    void sendNow()
  }

  function handleClose() {
    if (sending) return
    setJobId(null)
    setProgress({ jobId: '', sent: 0, total: 0, to: '', done: false, error: null })
    onClose()
  }

  if (!open) return null

  const pct = progress.total ? Math.min(100, Math.round((progress.sent / progress.total) * 100)) : 0

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Enviar mails"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="card modal send-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h3 className="modal__title">Enviar ({recipients.length})</h3>
          <button className="btn" type="button" onClick={handleClose} disabled={sending}>
            Cerrar
          </button>
        </header>

        <div className="modal__content form-2col">
          <div className="field">
            <label className="label">Host</label>
            <input className="input" value={smtp.host} onChange={bind('host')} disabled={sending} />
          </div>

          <div className="field">
            <label className="label">Puerto</label>
            <input className="input" value={smtp.port} onChange={bind('port')} disabled={sending} />
          </div>

          <div className="field field-inline">
            <input id="sec-send" type="checkbox" checked={!!smtp.secure} onChange={bind('secure')} disabled={sending} />
            <label htmlFor="sec-send" className="label-inline">
              TLS/SSL
            </label>
          </div>

          <div className="field">
            <label className="label">Usuario</label>
            <input className="input" value={smtp.user || ''} onChange={bind('user')} disabled={sending} />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" value={smtp.pass || ''} onChange={bind('pass')} disabled={sending} />
          </div>

          <div className="field span-2">
            <div className="grid-2">
              <div className="field">
                <label className="label">From Nombre</label>
                <input className="input" value={smtp.fromName || ''} onChange={bind('fromName')} disabled={sending} />
              </div>
              <div className="field">
                <label className="label">From Email</label>
                <input className="input" value={smtp.fromEmail || ''} onChange={bind('fromEmail')} disabled={sending} />
              </div>
            </div>
          </div>

          <div className="field span-2">
            <label className="label">Delay entre mails (ms)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={throttle}
              onChange={(e) => setSmtp((p) => ({ ...p, throttleMs: Number(e.target.value) }))}
              disabled={sending}
            />
          </div>

          {(sending || jobId) && (
            <div className="span-2">
              <div className="progress">
                <div className="progress__fill" style={{ width: `${pct}%` }} />
              </div>

              <p className="help">
                {progress.sent} / {progress.total} · Último: {progress.to || '—'}{' '}
                {progress.error ? `· Error: ${progress.error}` : ''}
              </p>

              {progress.done && !progress.error && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      alert('Envío finalizado')
                      handleClose()
                    }}
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="modal__footer">
          <button className="btn" type="button" onClick={onTestClick} disabled={sending}>
            Probar SMTP
          </button>
          <button className="btn btn-primary" type="button" onClick={onSendClick} disabled={sending || !recipients.length}>
            Enviar ahora
          </button>
        </footer>
      </div>
    </div>
  )
}
