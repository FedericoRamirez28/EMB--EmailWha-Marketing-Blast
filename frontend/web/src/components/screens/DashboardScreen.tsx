// src/components/screens/DashboardScreen.tsx
import React, { useMemo, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import RecipientsPanel from '@/components/ui/RecipientsPanel'
import MessagePanel, { type ReadyPayload } from '@/components/ui/MessagePanel'
import type { Recipient } from '@/lib/recipientsApi'

import SmtpConfigModal from '@/components/modals/SmtpConfigModal'
import SendModal from '@/components/modals/SendModal'

type SendMessage = {
  subject: string
  html: string
  attachments: Array<{ path: string }>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function pickAttachmentPath(v: unknown): string | null {
  if (!isRecord(v)) return null

  const p = v.path
  if (typeof p === 'string' && p.length > 0) return p

  const u = v.url
  if (typeof u === 'string' && u.length > 0) return u

  const fp = v.filepath
  if (typeof fp === 'string' && fp.length > 0) return fp

  return null
}

function toSendMessage(msg: ReadyPayload | null): SendMessage {
  const subject = msg?.subject ?? ''
  const html = msg?.html ?? ''

  const raw = msg?.attachments ?? []
  const attachments: Array<{ path: string }> = []

  for (const a of raw) {
    const path = pickAttachmentPath(a)
    if (path) attachments.push({ path })
  }

  return { subject, html, attachments }
}

export function DashboardScreen() {
  const { user } = useAuth()

  const [sel, setSel] = useState<Recipient[]>([])
  const [msg, setMsg] = useState<ReadyPayload | null>(null)

  const [smtpOpen, setSmtpOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  const readyLabel = useMemo(() => {
    if (!msg) return 'Mensaje: —'
    const attCount = msg.attachments?.length ?? 0
    const subjOk = msg.subject?.trim().length ? 'OK' : 'Falta asunto'
    const bodyOk = msg.html?.trim().length ? 'OK' : 'Falta cuerpo'
    return `Mensaje: ${subjOk} · ${bodyOk} · Adjuntos: ${attCount}`
  }, [msg])

  const canSend = useMemo(() => {
    if (!sel.length) return false
    if (!msg) return false
    if (!msg.subject?.trim()) return false
    if (!msg.html?.trim()) return false
    return true
  }, [sel.length, msg])

  const sendMessage = useMemo(() => toSendMessage(msg), [msg])

  return (
    <div style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>Dashboard</h2>

        <p style={{ opacity: 0.85 }}>
          Logueado como: <b>{user?.email ?? '—'}</b>
        </p>

        <p style={{ opacity: 0.75 }}>
          Pantalla principal (web): desde acá vamos a ir migrando todos los paneles.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn" type="button" onClick={() => setSmtpOpen(true)}>
            Configurar SMTP
          </button>

          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setSendOpen(true)}
            disabled={!canSend}
            title={!canSend ? 'Seleccioná destinatarios y completá asunto/cuerpo' : 'Enviar'}
          >
            Enviar ({sel.length})
          </button>
        </div>

        <p style={{ opacity: 0.75, marginTop: 10 }}>Seleccionados: {sel.length}</p>
        <p style={{ opacity: 0.75 }}>{readyLabel}</p>
      </div>

      <RecipientsPanel onSelectionChange={setSel} />
      <MessagePanel onReady={setMsg} />

      {/* ===== Modales ===== */}
      <SmtpConfigModal open={smtpOpen} onClose={() => setSmtpOpen(false)} />

      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} recipients={sel} message={sendMessage} />
    </div>
  )
}
