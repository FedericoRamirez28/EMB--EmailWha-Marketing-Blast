// src/components/ui/MessagePanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { attachmentsApi, type Attachment } from '@/lib/attachmentApi'

export type ReadyPayload = {
  subject: string
  html: string
  attachments: { url: string; originalName: string }[]
}

/** ✅ Compatible con targets viejos (sin String.prototype.replaceAll) */
function replaceAllCompat(input: string, search: string, replacement: string): string {
  // escapamos regex chars en el "search"
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return input.replace(new RegExp(escaped, 'g'), replacement)
}

export default function MessagePanel({ onReady }: { onReady: (payload: ReadyPayload) => void }) {
  const { token } = useAuth()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('<p>Hola {{nombre}},<br/>Este es un mensaje de prueba.</p>')
  const [atts, setAtts] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    void refreshAtts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    onReady({
      subject,
      html,
      attachments: atts.map((a) => ({
        url: attachmentsApi.downloadUrl(a),
        originalName: a.originalName,
      })),
    })
  }, [subject, html, atts, onReady])

  async function refreshAtts() {
    if (!token) return
    const got = await attachmentsApi.list(token)
    setAtts(got)
  }

  function openPicker() {
    fileRef.current?.click()
  }

  async function onPickFiles(files: FileList | null) {
    if (!token) return
    const arr = Array.from(files ?? [])
    if (!arr.length) return

    setBusy(true)
    try {
      await attachmentsApi.uploadMany(token, arr)
      await refreshAtts()
    } finally {
      setBusy(false)
    }
  }

  async function removeAtt(id: number) {
    if (!token) return
    const ok = confirm('¿Quitar adjunto?')
    if (!ok) return
    setBusy(true)
    try {
      await attachmentsApi.remove(token, id)
      await refreshAtts()
    } finally {
      setBusy(false)
    }
  }

  function previewInline() {
    let demo = html
    demo = replaceAllCompat(demo, '{{nombre}}', 'Directivo')
    demo = replaceAllCompat(demo, '{{email}}', 'equipo@institucion.edu')

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      alert('No se pudo abrir la vista previa (bloqueada por el navegador).')
      return
    }

    const safeTitle = (subject || 'Vista previa').replace(/[<>]/g, '')
    w.document.open()
    w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body{font-family: Arial, system-ui; padding:20px; background:#0b1222; color:#fff;}
      .card{max-width:900px; margin:0 auto; background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:16px;}
      .meta{opacity:.8; font-size:13px; margin-bottom:10px;}
      hr{border:none; border-top:1px solid rgba(255,255,255,.12); margin:14px 0;}
      .atts{font-size:12px; opacity:.85;}
      code{background: rgba(0,0,0,.35); padding:2px 6px; border-radius:8px; border:1px solid rgba(255,255,255,.12);}
      a{color:#2ea8ff}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="meta"><strong>Asunto:</strong> ${safeTitle}</div>
      <hr/>
      ${demo}
      <hr/>
      <div class="atts">
        <strong>Adjuntos:</strong>
        ${atts.length ? `<ul>${atts.map((a) => `<li><code>${a.originalName}</code></li>`).join('')}</ul>` : `<span>Sin adjuntos</span>`}
      </div>
    </div>
  </body>
</html>`)
    w.document.close()
  }

  const hasAtts = useMemo(() => atts.length > 0, [atts.length])

  return (
    <section className="card messagePanel" aria-label="Panel de mensaje">
      <header className="panel-header">
        <h2 className="panel-title">Mensaje</h2>
      </header>

      <div className="messagePanel__grid">
        <div className="field">
          <label className="label" htmlFor="msg-subject">
            Asunto
          </label>
          <input
            id="msg-subject"
            className="input"
            placeholder="Ej: Comunicado importante"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="msg-html">
            Cuerpo HTML
          </label>
          <textarea
            id="msg-html"
            className="input messagePanel__html"
            placeholder="Pegá acá el HTML del mensaje"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
          />
          <p className="help">
            Podés usar <code>{'{{nombre}}'}</code> y <code>{'{{email}}'}</code>.
          </p>
        </div>
      </div>

      <div className="messagePanel__attachments">
        <div className="messagePanel__attHeader">
          <h3 className="messagePanel__attTitle">Adjuntos</h3>

          <div className="messagePanel__attActions">
            <button className="btn" type="button" onClick={previewInline}>
              Vista previa
            </button>

            <button className="btn" type="button" onClick={openPicker} disabled={busy}>
              {busy ? 'Subiendo…' : 'Agregar adjuntos…'}
            </button>

            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void onPickFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
          </div>
        </div>

        <ul className="messagePanel__attList">
          {atts.map((a) => (
            <li key={a.id} className="messagePanel__attItem">
              <a className="messagePanel__attLink" href={attachmentsApi.downloadUrl(a)} target="_blank" rel="noreferrer">
                {a.originalName}
              </a>

              <button className="btn btn-danger" type="button" onClick={() => void removeAtt(a.id)} disabled={busy}>
                Quitar
              </button>
            </li>
          ))}

          {!hasAtts && <li className="messagePanel__attEmpty">Sin adjuntos</li>}
        </ul>
      </div>
    </section>
  )
}
