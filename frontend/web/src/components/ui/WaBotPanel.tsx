// src/components/ui/waBotPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { useAuth } from '@/auth/useAuth'

function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL
  return typeof v === 'string' ? v : ''
}

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function clampInt(n: number, min: number, max: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

// --- Interfaces de Tipado ---
type BotConfig = {
  enabled: boolean
  maxRepliesPerContact: number
  replyDelayMs: number
  onlyIfCampaignItemExists: boolean
  lookbackDays: number

  businessHoursEnabled: boolean
  timezone: string
  businessStart: string
  businessEnd: string
  outOfHoursReply: string

  defaultReply: string

  optOutKeywordsCsv: string
  optOutReply: string
}

interface ApiResponse {
  ok: boolean
  data?: Partial<BotConfig>
  error?: string
  message?: string
}

const DEFAULT_CFG: BotConfig = {
  enabled: true,
  maxRepliesPerContact: 1,
  replyDelayMs: 0,
  onlyIfCampaignItemExists: true,
  lookbackDays: 60,

  businessHoursEnabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  businessStart: '09:00',
  businessEnd: '18:00',
  outOfHoursReply: '¡Gracias por escribir! Un asesor te responde en el próximo horario laboral.',

  defaultReply:
    'Hola {NOMBRE} 👋 Gracias por escribir a Medic.\n' +
    '¿Te interesa Plan Individual o Familiar?\n' +
    'Respondé con: 1) Individual  2) Familiar.\n' +
    'Un asesor te contacta en breve.',

  optOutKeywordsCsv: 'baja,stop,no',
  optOutReply: 'Entendido. Te damos de baja y no volveremos a contactarte por este medio.',
}

export default function WaBotPanel() {
  const apiBase = useMemo(() => getApiBase(), [])
  const { token } = useAuth()

  const [cfg, setCfg] = useState<BotConfig>(DEFAULT_CFG)
  const [loading, setLoading] = useState(false)
  const lockSave = useRef(false)

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      const r = await fetch(`${apiBase}/whapi/bot-config`, { headers: authHeaders(token) })
      const j = (await r.json().catch(() => null)) as ApiResponse | null
      
      const got = j?.data && typeof j.data === 'object' ? j.data : null
      setCfg((prev) => ({ ...prev, ...(got || {}) }))
    } catch (err) {
      console.error('Error loading bot config:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function save() {
    if (!token || lockSave.current) return
    lockSave.current = true
    try {
      const payload: BotConfig = {
        ...cfg,
        maxRepliesPerContact: clampInt(cfg.maxRepliesPerContact, 0, 10),
        replyDelayMs: clampInt(cfg.replyDelayMs, 0, 60_000),
        lookbackDays: clampInt(cfg.lookbackDays, 1, 365),
      }

      const r = await fetch(`${apiBase}/whapi/bot-config`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      })
      
      const j = (await r.json().catch(() => null)) as ApiResponse | null
      
      if (j?.ok !== true) {
        await Swal.fire({ 
            icon: 'error', 
            title: 'Error guardando', 
            text: j?.error || j?.message || 'No se pudo guardar.' 
        })
        return
      }
      
      const savedData = j.data && typeof j.data === 'object' ? j.data : payload
      setCfg((prev) => ({ ...prev, ...savedData }))
      
      await Swal.fire({ icon: 'success', title: 'Guardado', text: 'Configuración del bot actualizada.' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await Swal.fire({ icon: 'error', title: 'Error', text: msg })
    } finally {
      lockSave.current = false
    }
  }

  return (
    <div className="waScreen__card">
      <div className="waSectionTitle">Bot de Auto-Respuesta (Ventas)</div>
      <div className="waScreen__note">
        El bot responde automáticamente cuando llega un <b>mensaje entrante</b> (webhook <b>messages.post</b>) de un contacto que fue impactado por una campaña reciente.
      </div>

      <div className="waBotGrid">
        <label className="waScreen__field">
          <span className="waScreen__label">Bot habilitado</span>
          <div className="waCheck">
            <input id="botEnabled" type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg((p) => ({ ...p, enabled: e.target.checked }))} />
            <label htmlFor="botEnabled">Activar auto-respuesta</label>
          </div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Máx. respuestas por contacto</span>
          <input
            className="waScreen__input"
            type="number"
            min={0}
            max={10}
            value={cfg.maxRepliesPerContact}
            onChange={(e) => setCfg((p) => ({ ...p, maxRepliesPerContact: Number(e.target.value || 0) }))}
          />
          <div className="waScreen__hint">0 = nunca responde (solo registra). 1 = primera respuesta y listo.</div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Delay (ms) antes de responder</span>
          <input
            className="waScreen__input"
            type="number"
            min={0}
            max={60000}
            value={cfg.replyDelayMs}
            onChange={(e) => setCfg((p) => ({ ...p, replyDelayMs: Number(e.target.value || 0) }))}
          />
          <div className="waScreen__hint">Sirve para “parecer humano”. Ej: 1500–3000ms.</div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Solo responder si fue parte de campaña</span>
          <div className="waCheck">
            <input
              id="onlyCampaign"
              type="checkbox"
              checked={cfg.onlyIfCampaignItemExists}
              onChange={(e) => setCfg((p) => ({ ...p, onlyIfCampaignItemExists: e.target.checked }))}
            />
            <label htmlFor="onlyCampaign">No responder a desconocidos</label>
          </div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Ventana (días) para asociar campañas</span>
          <input
            className="waScreen__input"
            type="number"
            min={1}
            max={365}
            value={cfg.lookbackDays}
            onChange={(e) => setCfg((p) => ({ ...p, lookbackDays: Number(e.target.value || 60) }))}
          />
          <div className="waScreen__hint">Ej: 60 días. Si responde después, el bot no actúa (si está marcado “solo campaña”).</div>
        </label>

        <label className="waScreen__field waBotSpan2">
          <span className="waScreen__label">Mensaje inicial del bot</span>
          <textarea
            className="waScreen__textarea"
            rows={6}
            value={cfg.defaultReply}
            onChange={(e) => setCfg((p) => ({ ...p, defaultReply: e.target.value }))}
          />
          <div className="waScreen__hint">Soporta variable: <b>{'{NOMBRE}'}</b></div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Horario laboral</span>
          <div className="waCheck">
            <input
              id="bh"
              type="checkbox"
              checked={cfg.businessHoursEnabled}
              onChange={(e) => setCfg((p) => ({ ...p, businessHoursEnabled: e.target.checked }))}
            />
            <label htmlFor="bh">Aplicar horario</label>
          </div>
          <div className="waScreen__hint">Si está activo, fuera de horario envía un mensaje alternativo.</div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Timezone</span>
          <input className="waScreen__input" value={cfg.timezone} onChange={(e) => setCfg((p) => ({ ...p, timezone: e.target.value }))} />
          <div className="waScreen__hint">Ej: America/Argentina/Buenos_Aires</div>
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Inicio</span>
          <input className="waScreen__input" value={cfg.businessStart} onChange={(e) => setCfg((p) => ({ ...p, businessStart: e.target.value }))} placeholder="09:00" />
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Fin</span>
          <input className="waScreen__input" value={cfg.businessEnd} onChange={(e) => setCfg((p) => ({ ...p, businessEnd: e.target.value }))} placeholder="18:00" />
        </label>

        <label className="waScreen__field waBotSpan2">
          <span className="waScreen__label">Respuesta fuera de horario</span>
          <textarea
            className="waScreen__textarea"
            rows={3}
            value={cfg.outOfHoursReply}
            onChange={(e) => setCfg((p) => ({ ...p, outOfHoursReply: e.target.value }))}
          />
        </label>

        <label className="waScreen__field">
          <span className="waScreen__label">Palabras de baja (CSV)</span>
          <input
            className="waScreen__input"
            value={cfg.optOutKeywordsCsv}
            onChange={(e) => setCfg((p) => ({ ...p, optOutKeywordsCsv: e.target.value }))}
            placeholder="baja,stop,no"
          />
        </label>

        <label className="waScreen__field waBotSpan2">
          <span className="waScreen__label">Respuesta a BAJA</span>
          <textarea
            className="waScreen__textarea"
            rows={2}
            value={cfg.optOutReply}
            onChange={(e) => setCfg((p) => ({ ...p, optOutReply: e.target.value }))}
          />
        </label>
      </div>

      <div className="waScreen__actions">
        <button className="waBtn" type="button" onClick={() => void load()} disabled={loading}>
          ↻ Recargar
        </button>
        <button className="waScreen__primary" type="button" onClick={() => void save()} disabled={loading}>
          Guardar configuración
        </button>
      </div>
    </div>
  )
}