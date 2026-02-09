import React, { useMemo, useState } from 'react'

function getApiBase(): string {
  // Tu env actual:
  // VITE_API_URL=http://localhost:3001
  const v = import.meta.env.VITE_API_URL
  return typeof v === 'string' ? v : ''
}

function normPhone(raw: string): string {
  return String(raw ?? '').replace(/[^\d]/g, '').trim()
}

function errToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function WhatsappScreen() {
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')
  const [out, setOut] = useState<string>('')

  const apiBase = useMemo(() => getApiBase(), [])
  const toNorm = useMemo(() => normPhone(to), [to])

  async function sendTest(): Promise<void> {
    setOut('Enviando...')
    try {
      const r = await fetch(`${apiBase}/whapi/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toNorm, body }),
      })

      // ✅ evitar "unsafe assignment": no asignamos a variable tipada con algo inseguro
      const parsed: unknown = await r.json().catch(() => null)

      if (parsed && typeof parsed === 'object') {
        setOut(JSON.stringify(parsed, null, 2))
      } else {
        setOut(JSON.stringify({ ok: false, error: 'Respuesta inválida del servidor' }, null, 2))
      }
    } catch (e: unknown) {
      setOut(JSON.stringify({ ok: false, error: errToMessage(e) }, null, 2))
    }
  }

  return (
    <div className="waScreen">
      <div className="waScreen__head">
        <div className="waScreen__title">WhatsApp masivo</div>
        <div className="waScreen__subtitle">Conexión vía Whapi (MVP: envío de prueba)</div>
      </div>

      <div className="waScreen__card">
        <label className="waScreen__field">
          <span className="waScreen__label">Número destino</span>
          <input
            className="waScreen__input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Ej: 54911XXXXXXXX"
            inputMode="numeric"
          />
          <div className="waScreen__hint">
            Normalizado: <b>{toNorm || '—'}</b>
          </div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Mensaje</span>
          <textarea
            className="waScreen__textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Escribí el texto del mensaje…"
          />
        </label>

        <div className="waScreen__actions">
          <button
            className="waScreen__primary"
            type="button"
            onClick={() => void sendTest()} // ✅ no-misused-promises
            disabled={!toNorm || !body.trim()}
            title={!toNorm || !body.trim() ? 'Completá número y mensaje' : 'Enviar'}
          >
            Enviar prueba
          </button>

          <div className="waScreen__note">
            Próximo paso: campaña masiva con tags/blocks + progreso + estados (delivered/read)
          </div>
        </div>
      </div>

      <div className="waScreen__log">
        <div className="waScreen__logTitle">Respuesta</div>
        <pre className="waScreen__pre">{out || '—'}</pre>
      </div>
    </div>
  )
}
