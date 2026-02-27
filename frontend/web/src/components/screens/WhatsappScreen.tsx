// src/components/screens/WhatsappScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { useAuth } from '@/auth/useAuth'
import WaRecipientsPanel from '@/components/ui/WaRecipientsPanel'
import { attachmentsApi, type Attachment } from '@/lib/attachmentApi'

function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL
  return typeof v === 'string' ? v : ''
}

function errToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) return 'Error'
  return String(e)
}

type AnyRecord = Record<string, unknown>
function isRecord(v: unknown): v is AnyRecord { return typeof v === 'object' && v !== null }
function getString(o: AnyRecord, k: string): string | undefined { const v = o[k]; return typeof v === 'string' ? v : undefined }
function getNumber(o: AnyRecord, k: string): number | undefined { const v = o[k]; return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function getBool(o: AnyRecord, k: string): boolean | undefined { const v = o[k]; return typeof v === 'boolean' ? v : undefined }
function getRecord(o: AnyRecord, k: string): AnyRecord | undefined { const v = o[k]; return isRecord(v) ? v : undefined }
function getArray(o: AnyRecord, k: string): unknown[] | undefined { const v = o[k]; return Array.isArray(v) ? v : undefined }
function clampInt(n: number, min: number, max: number): number { const x = Math.trunc(n); if (!Number.isFinite(x)) return min; return Math.max(min, Math.min(max, x)) }
function toLocal(dtIso: string | null | undefined): string {
  if (!dtIso) return '—'
  const d = new Date(dtIso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

type StatusValue = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
type HealthResp = { ok: true; configured: boolean; baseUrl: string } | { ok: false; error: string }
type CampaignStatus = 'draft' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed'
type MediaType = 'text' | 'image' | 'video' | 'document'

type CampaignRow = {
  id: string
  name: string
  status: CampaignStatus
  total: number
  doneCount: number
  sentCount: number
  deliveredCount: number
  readCount: number
  failedCount: number
  skippedCount: number
  delayMs: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  scheduledAt?: string | null
  mediaType?: MediaType
  attachmentId?: number | null
}

type CampaignItemRow = { id: string; to: string; name: string | null; status: StatusValue; attempts: number; lastError: string | null; updatedAt: string; messageId: string | null }
type CampaignDetailOk = { ok: true; data: CampaignRow & { body: string; blockId: number | null; tags: string | null; requireAllTags: boolean; items: CampaignItemRow[] } }
type CampaignDetailErr = { ok: false; error: string }
type CampaignDetail = CampaignDetailOk | CampaignDetailErr

type CreateCampaignResp = { ok: true; id: string } | { ok: false; error: string }
type ListCampaignsResp = { ok: true; data: CampaignRow[] } | { ok: false; error: string }

type TabKey = 'campaigns' | 'blocks' | 'metrics'
type CampaignsSubTab = 'create' | 'list'
type BlockCfg = { id: number; name: string; capacity: number }

function parseHealthResp(u: unknown): HealthResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  const ok = getBool(u, 'ok')
  if (ok !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  return { ok: true, configured: Boolean(getBool(u, 'configured')), baseUrl: getString(u, 'baseUrl') ?? '' }
}

function parseCampaignRow(u: unknown): CampaignRow | null {
  if (!isRecord(u)) return null
  const id = getString(u, 'id'); const name = getString(u, 'name'); const status = getString(u, 'status') as CampaignStatus | undefined
  if (!id || !name || !status) return null
  const num = (k: string, fallback = 0) => clampInt(getNumber(u, k) ?? fallback, 0, 1_000_000_000)
  const mt = (getString(u, 'mediaType') as MediaType | undefined) ?? 'text'
  return {
    id, name, status,
    total: num('total'),
    doneCount: num('doneCount'),
    sentCount: num('sentCount'),
    deliveredCount: num('deliveredCount'),
    readCount: num('readCount'),
    failedCount: num('failedCount'),
    skippedCount: num('skippedCount'),
    delayMs: num('delayMs', 2500),
    createdAt: getString(u, 'createdAt') ?? new Date().toISOString(),
    startedAt: getString(u, 'startedAt') ?? null,
    finishedAt: getString(u, 'finishedAt') ?? null,
    scheduledAt: getString(u, 'scheduledAt') ?? null,
    mediaType: mt,
    attachmentId: getNumber(u, 'attachmentId') ?? null,
  }
}

function parseListCampaignsResp(u: unknown): ListCampaignsResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  if (getBool(u, 'ok') !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  const arr = getArray(u, 'data')
  if (!arr) return { ok: true, data: [] }
  return { ok: true, data: arr.map(parseCampaignRow).filter((x): x is CampaignRow => Boolean(x)) }
}

function parseCampaignItemRow(u: unknown): CampaignItemRow | null {
  if (!isRecord(u)) return null
  const id = getString(u, 'id'); const to = getString(u, 'to')
  if (!id || !to) return null
  const statusRaw = getString(u, 'status') ?? 'pending'
  return {
    id, to,
    name: getString(u, 'name') ?? null,
    status: statusRaw as StatusValue,
    attempts: clampInt(getNumber(u, 'attempts') ?? 0, 0, 999),
    lastError: getString(u, 'lastError') ?? null,
    updatedAt: getString(u, 'updatedAt') ?? new Date().toISOString(),
    messageId: getString(u, 'messageId') ?? null,
  }
}

function parseCampaignDetail(u: unknown): CampaignDetail {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  if (getBool(u, 'ok') !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  const data = getRecord(u, 'data')
  if (!data) return { ok: false, error: 'Respuesta inválida (data)' }
  const row = parseCampaignRow(data)
  if (!row) return { ok: false, error: 'Respuesta inválida (campaign)' }
  const itemsArr = getArray(data, 'items') ?? []
  return {
    ok: true,
    data: {
      ...row,
      body: getString(data, 'body') ?? '',
      blockId: getNumber(data, 'blockId') ?? null,
      tags: getString(data, 'tags') ?? null,
      requireAllTags: Boolean(getBool(data, 'requireAllTags')),
      items: itemsArr.map(parseCampaignItemRow).filter((x): x is CampaignItemRow => Boolean(x)),
    },
  }
}

function parseCreateCampaignResp(u: unknown): CreateCampaignResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  if (getBool(u, 'ok') === true) return { ok: true, id: getString(u, 'id') ?? '' }
  return { ok: false, error: getString(u, 'error') ?? 'Error' }
}

function parseBlocksResp(u: unknown): BlockCfg[] {
  if (!Array.isArray(u)) return []
  const out: BlockCfg[] = []
  for (const row of u) {
    if (!isRecord(row)) continue
    const id = getNumber(row, 'id'); const name = getString(row, 'name'); const capacity = getNumber(row, 'capacity')
    if (typeof id === 'number' && typeof name === 'string' && typeof capacity === 'number') out.push({ id, name, capacity })
  }
  return out.sort((a, b) => a.id - b.id)
}

function swalOk(title: string, text?: string) { return Swal.fire({ icon: 'success', title, text, confirmButtonText: 'OK' }) }
function swalErr(title: string, text?: string) { return Swal.fire({ icon: 'error', title, text, confirmButtonText: 'Cerrar' }) }

export function WhatsappScreen() {
  const apiBase = useMemo(() => getApiBase(), [])
  const { token } = useAuth()

  const [configured, setConfigured] = useState<boolean>(false)
  const [tab, setTab] = useState<TabKey>('campaigns')
  const [campaignsSub, setCampaignsSub] = useState<CampaignsSubTab>('create')
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string>('—')

  const [metricsFilter, setMetricsFilter] = useState<StatusValue | 'all'>('all')
  function bumpRefresh(): void { setRefreshKey((x) => x + 1) }

  const [blocks, setBlocks] = useState<BlockCfg[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  // Create campaign fields
  const [campName, setCampName] = useState('Campaña WhatsApp')
  const [campBody, setCampBody] = useState('')
  const [campTags, setCampTags] = useState('')
  const [campRequireAll, setCampRequireAll] = useState(false)
  const [campBlockId, setCampBlockId] = useState<string>('')
  const [campDelayMs, setCampDelayMs] = useState<number>(2500)

  const [campMediaType, setCampMediaType] = useState<MediaType>('text')
  const [campAttachmentId, setCampAttachmentId] = useState<string>('')

  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledLocal, setScheduledLocal] = useState('') // datetime-local

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null)

  const lockCreate = useRef(false)
  const lockAction = useRef(false)

  // Health
  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/health`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const h = parseHealthResp(j)
        if (!alive) return
        setConfigured(h.ok ? Boolean(h.configured) : false)
      } catch {
        if (alive) setConfigured(false)
      }
    }
    void run()
    return () => { alive = false }
  }, [apiBase, token])

  // Blocks
  useEffect(() => {
    if (tab !== 'campaigns' && tab !== 'blocks') return
    let alive = true
    const load = async () => {
      if (!token) return
      try {
        const r = await fetch(`${apiBase}/blocks`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        if (!alive) return
        setBlocks(parseBlocksResp(j))
        setLastUpdated(new Date().toLocaleTimeString())
      } catch {
        if (!alive) return
        setBlocks([])
      }
    }
    void load()
    return () => { alive = false }
  }, [apiBase, token, tab, refreshKey])

  // Attachments
  useEffect(() => {
    if (!token) return
    if (tab !== 'campaigns') return
    let alive = true
    const load = async () => {
      try {
        const rows = await attachmentsApi.list(token)
        if (!alive) return
        setAttachments(rows)
      } catch {
        if (!alive) return
        setAttachments([])
      }
    }
    void load()
    return () => { alive = false }
  }, [token, tab, refreshKey])

  // Campaigns list
  useEffect(() => {
    if (tab !== 'campaigns' && tab !== 'metrics') return
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/campaigns`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const resp = parseListCampaignsResp(j)
        if (!alive) return
        if (resp.ok) { setCampaigns(resp.data); setLastUpdated(new Date().toLocaleTimeString()) }
      } catch {
        // ignore
      }
    }
    void load()
    return () => { alive = false }
  }, [apiBase, token, tab, refreshKey])

  // Campaign detail
  useEffect(() => {
    if (tab !== 'metrics') return
    if (!selectedCampaignId) return
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/campaign/${selectedCampaignId}`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const resp = parseCampaignDetail(j)
        if (!alive) return
        setCampaignDetail(resp)
        setLastUpdated(new Date().toLocaleTimeString())
      } catch {
        // ignore
      }
    }
    void load()
    return () => { alive = false }
  }, [apiBase, selectedCampaignId, token, tab, refreshKey])

  function percent(done: number, total: number) { return total ? Math.max(0, Math.min(100, (done / total) * 100)) : 0 }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'read': return <span className="waPill waPill--read">✓✓ Leído</span>
      case 'delivered': return <span className="waPill waPill--delivered">✓✓ Entregado</span>
      case 'sent': return <span className="waPill waPill--sent">✓ Enviado</span>
      case 'failed': return <span className="waPill waPill--failed">❌ Fallido</span>
      case 'skipped': return <span className="waPill waPill--skipped">⏭ Omitido</span>
      default: return <span className="waPill waPill--pending">⏳ Pendiente</span>
    }
  }

  const effectiveDetail = selectedCampaignId ? campaignDetail : null
  const selected = effectiveDetail?.ok ? effectiveDetail.data : null
  const progress = selected ? percent(selected.doneCount, selected.total) : 0

  const filteredItems = useMemo(() => {
    if (!selected) return []
    if (metricsFilter === 'all') return selected.items
    return selected.items.filter(it => it.status === metricsFilter)
  }, [selected, metricsFilter])

  const canCreate = useMemo(() => {
    if (!configured) return false
    if (campMediaType === 'text') return Boolean(campBody.trim())
    return Boolean(campAttachmentId.trim())
  }, [configured, campMediaType, campBody, campAttachmentId])

  function buildScheduledIso(): string | undefined {
    if (!scheduleEnabled) return undefined
    const s = String(scheduledLocal || '').trim()
    if (!s) return undefined
    const d = new Date(s) // local
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }

  async function uploadNow(files: File[]) {
    if (!token) return
    if (!files.length) return
    try {
      await attachmentsApi.uploadMany(token, files)
      bumpRefresh()
      await swalOk('Adjunto subido', 'Ya podés seleccionarlo en la campaña.')
    } catch (e: unknown) {
      await swalErr('Error subiendo adjunto', errToMessage(e))
    }
  }

  async function createCampaign(): Promise<void> {
    if (lockCreate.current) return
    lockCreate.current = true
    try {
      const blockIdNum = campBlockId.trim() ? Number(campBlockId.trim()) : NaN
      const attachmentIdNum = campAttachmentId.trim() ? Number(campAttachmentId.trim()) : NaN

      const payload: Record<string, unknown> = {
        name: campName.trim() || 'Campaña WhatsApp',
        body: campBody,
        tags: campTags.trim() || undefined,
        requireAllTags: campRequireAll,
        delayMs: clampInt(Number(campDelayMs || 0), 250, 3_600_000),
        mediaType: campMediaType,
        scheduledAt: buildScheduledIso(),
      }

      if (Number.isFinite(blockIdNum)) payload.blockId = blockIdNum
      if (campMediaType !== 'text' && Number.isFinite(attachmentIdNum)) payload.attachmentId = attachmentIdNum

      const r = await fetch(`${apiBase}/whapi/campaign`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) })
      const j: unknown = await r.json().catch(() => null)
      const resp = parseCreateCampaignResp(j)

      if (resp.ok && resp.id) {
        setSelectedCampaignId(resp.id)
        setTab('metrics')
        setLastUpdated(new Date().toLocaleTimeString())
        bumpRefresh()
        await swalOk('Campaña creada', scheduleEnabled ? 'Quedó programada / o se ejecuta según hora.' : 'Se creó y comenzó a ejecutarse.')
        return
      }
      await swalErr('No se pudo crear', resp.ok ? 'Error' : resp.error)
    } catch (e: unknown) {
      await swalErr('Error', errToMessage(e))
    } finally { lockCreate.current = false }
  }

  async function campaignAction(path: string): Promise<void> {
    if (!selectedCampaignId || lockAction.current) return
    lockAction.current = true
    try {
      const confirm = path === 'cancel'
        ? await Swal.fire({ icon: 'warning', title: '¿Cancelar campaña?', showCancelButton: true, confirmButtonText: 'Sí, cancelar' })
        : { isConfirmed: true }
      if (!confirm.isConfirmed) return

      await fetch(`${apiBase}/whapi/campaign/${selectedCampaignId}/${path}`, { method: 'POST', headers: authHeaders(token) })
      setLastUpdated(new Date().toLocaleTimeString())
      bumpRefresh()
      await swalOk('Acción aplicada', `Se ejecutó: ${path}`)
    } catch (e: unknown) {
      await swalErr('Error', errToMessage(e))
    } finally { lockAction.current = false }
  }

  function fmtMedia(mt?: string | null) {
    const s = String(mt || 'text')
    if (s === 'image') return 'Imagen'
    if (s === 'video') return 'Video'
    if (s === 'document') return 'Documento'
    return 'Texto'
  }

  const selectedAttachment = useMemo(() => {
    const idNum = Number(campAttachmentId || 0)
    if (!Number.isFinite(idNum) || idNum <= 0) return null
    return attachments.find(a => a.id === idNum) ?? null
  }, [campAttachmentId, attachments])

  return (
    <div className="waScreen">
      <div className="waScreen__head">
        <div className="waScreen__title">WhatsApp masivo</div>
        <div className="waScreen__subtitle">Whapi + campañas + tracking (sent/delivered/read)</div>

        <div className="waScreen__meta">
          <span className={`waPill ${configured ? 'waPill--ok' : 'waPill--warn'}`}>{configured ? 'Whapi configurado' : 'Whapi no configurado'}</span>
          <span className="waPill waPill--muted">API: {apiBase || '—'}</span>
          <span className="waPill waPill--muted">Últ. update: {lastUpdated}</span>
        </div>

        <div className="waTabs">
          <button className={`waTab ${tab === 'campaigns' ? 'waTab--active' : ''}`} onClick={() => setTab('campaigns')} type="button">Campañas</button>
          <button className={`waTab ${tab === 'blocks' ? 'waTab--active' : ''}`} onClick={() => setTab('blocks')} type="button">Bloques</button>
          <button className={`waTab ${tab === 'metrics' ? 'waTab--active' : ''}`} onClick={() => setTab('metrics')} type="button">Métricas</button>
        </div>
      </div>

      <div className="waScreen__body">
        {tab === 'campaigns' && (
          <div className="waScreen__card">
            <div className="waSubTabs">
              <button className={`waSubTab ${campaignsSub === 'create' ? 'is-active' : ''}`} type="button" onClick={() => setCampaignsSub('create')}>Crear campañas</button>
              <button className={`waSubTab ${campaignsSub === 'list' ? 'is-active' : ''}`} type="button" onClick={() => setCampaignsSub('list')}>Últimas campañas</button>
            </div>

            {campaignsSub === 'create' && (
              <>
                <div className="waSectionTitle">Crear campaña</div>

                <div className="waGrid2">
                  <label className="waScreen__field">
                    <span className="waScreen__label">Nombre campaña</span>
                    <input className="waScreen__input" value={campName} onChange={(e) => setCampName(e.target.value)} />
                  </label>

                  <label className="waScreen__field">
                    <span className="waScreen__label">Tipo de campaña</span>
                    <select className="waScreen__input" value={campMediaType} onChange={(e) => setCampMediaType(e.target.value as MediaType)}>
                      <option value="text">Texto</option>
                      <option value="image">Imagen publicitaria</option>
                      <option value="video">Video</option>
                      <option value="document">Documento (PDF)</option>
                    </select>
                  </label>

                  <label className="waScreen__field">
                    <span className="waScreen__label">Bloque (opcional)</span>
                    <select className="waScreen__input" value={campBlockId} onChange={(e) => setCampBlockId(e.target.value)}>
                      <option value="">— Todos los bloques —</option>
                      {blocks.filter((b) => b.id > 0).map((b) => (<option key={b.id} value={String(b.id)}>{b.name} (ID {b.id})</option>))}
                    </select>
                  </label>

                  <label className="waScreen__field">
                    <span className="waScreen__label">Delay entre mensajes (ms)</span>
                    <input className="waScreen__input" value={String(campDelayMs)} onChange={(e) => setCampDelayMs(Number(e.target.value || 0))} inputMode="numeric" />
                  </label>

                  <label className="waScreen__field">
                    <span className="waScreen__label">Tags (CSV, opcional)</span>
                    <input className="waScreen__input" value={campTags} onChange={(e) => setCampTags(e.target.value)} placeholder="Ej: ventas,frio,medic" />
                    <div className="waCheck">
                      <input id="requireAll" type="checkbox" checked={campRequireAll} onChange={(e) => setCampRequireAll(e.target.checked)} />
                      <label htmlFor="requireAll">Requerir TODOS los tags</label>
                    </div>
                  </label>

                  <label className="waScreen__field">
                    <span className="waScreen__label">Programar envío</span>
                    <div className="waCheck">
                      <input id="scheduleEnabled" type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
                      <label htmlFor="scheduleEnabled">Habilitar programación</label>
                    </div>

                    <input
                      className="waScreen__input"
                      type="datetime-local"
                      value={scheduledLocal}
                      onChange={(e) => setScheduledLocal(e.target.value)}
                      disabled={!scheduleEnabled}
                    />
                    <div className="waScreen__hint">Se enviará automáticamente al llegar esa fecha/hora.</div>
                  </label>

                  {campMediaType !== 'text' && (
                    <label className="waScreen__field waGrid2__span2">
                      <span className="waScreen__label">Adjunto (desde la app)</span>

                      <div className="waMediaRow">
                        <select
                          className="waScreen__input"
                          value={campAttachmentId}
                          onChange={(e) => setCampAttachmentId(e.target.value)}
                        >
                          <option value="">— Elegí un adjunto —</option>
                          {attachments.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              #{a.id} · {a.originalName} ({Math.round((a.size / 1024 / 1024) * 10) / 10}MB)
                            </option>
                          ))}
                        </select>

                        <button className="waBtn" type="button" onClick={() => uploadInputRef.current?.click()}>
                          Subir adjunto
                        </button>
                        <button className="waBtn waBtn--ghost" type="button" onClick={() => bumpRefresh()}>
                          ↻ Refrescar
                        </button>
                      </div>

                      {selectedAttachment && (
                        <div className="waScreen__hint">
                          Seleccionado: <b>{selectedAttachment.originalName}</b> · {selectedAttachment.mimeType}
                        </div>
                      )}

                      <input
                        ref={uploadInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          e.target.value = ''
                          void uploadNow(files)
                        }}
                      />
                    </label>
                  )}

                  <label className="waScreen__field waGrid2__span2">
                    <span className="waScreen__label">{campMediaType === 'text' ? 'Mensaje campaña' : 'Caption (opcional)'}</span>
                    <textarea className="waScreen__textarea" value={campBody} onChange={(e) => setCampBody(e.target.value)} rows={4} placeholder="Texto/caption..." />
                  </label>
                </div>

                <div className="waScreen__actions">
                  <button className="waScreen__primary" type="button" disabled={!canCreate} onClick={() => void createCampaign()}>
                    {scheduleEnabled ? 'Crear campaña programada' : 'Crear y ejecutar campaña'}
                  </button>
                </div>
              </>
            )}

            {campaignsSub === 'list' && (
              <div className="waCampaignList">
                <div className="waTableWrap waTableWrap--max">
                  <table className="waTable">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Tipo</th>
                        <th>Status</th>
                        <th>Programada</th>
                        <th>Total</th>
                        <th>Done</th>
                        <th>Delay</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td>{fmtMedia(c.mediaType)}</td>
                          <td>{c.status}</td>
                          <td>{toLocal(c.scheduledAt ?? null)}</td>
                          <td>{c.total}</td>
                          <td>{c.doneCount}</td>
                          <td>{c.delayMs}ms</td>
                          <td>
                            <button className="waLinkBtn" type="button" onClick={() => { setSelectedCampaignId(c.id); setTab('metrics'); bumpRefresh() }}>
                              Ver Dashboard
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!campaigns.length && (
                        <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Sin campañas todavía.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'blocks' && (
          <div className="waScreen__card">
            <WaRecipientsPanel />
          </div>
        )}

        {tab === 'metrics' && (
          <div className="waScreen__card waMetricsDashboard">
            {!selected ? (
              <div className="waScreen__note" style={{ textAlign: 'center', padding: '40px' }}>
                📊 Elegí una campaña en la pestaña "Campañas" para ver sus métricas avanzadas.
              </div>
            ) : (
              <>
                <div className="waMetricsHead">
                  <div className="waMetricsHead__left">
                    <h2 className="waMetricsHead__title">{selected.name}</h2>
                    <div className="waMetricsHead__sub">
                      <span className={`waPill ${selected.status === 'done' ? 'waPill--ok' : 'waPill--warn'}`}>
                        {selected.status.toUpperCase()}
                      </span>
                      <span>Tipo: <b>{fmtMedia(selected.mediaType)}</b></span>
                      <span>Programada: <b>{toLocal(selected.scheduledAt ?? null)}</b></span>
                      <span>Progreso: {selected.doneCount} / {selected.total}</span>
                    </div>
                  </div>
                  <div className="waMetricsHead__actions">
                    <button className="waBtn" type="button" onClick={() => bumpRefresh()}>↻ Actualizar Info</button>
                    {selected.status !== 'done' && <button className="waBtn waBtn--danger" type="button" onClick={() => void campaignAction('cancel')}>Cancelar Envío</button>}
                  </div>
                </div>

                <div className="waProgress">
                  <div className="waProgress__bar">
                    <div className="waProgress__fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="waProgress__txt">{progress.toFixed(0)}%</div>
                </div>

                <div className="waKpiGrid">
                  <div className="waKpiCard">
                    <div className="waKpiCard__title">Total Enviados</div>
                    <div className="waKpiCard__value">{selected.sentCount}</div>
                  </div>

                  <div className="waKpiCard">
                    <div className="waKpiCard__title">✓✓ Entregados</div>
                    <div className="waKpiCard__value" style={{ color: '#334155' }}>{selected.deliveredCount}</div>
                    <div className="waKpiCard__desc">{percent(selected.deliveredCount, selected.sentCount).toFixed(0)}% del total</div>
                  </div>

                  <div className="waKpiCard waKpiCard--blue">
                    <div className="waKpiCard__title">✓✓ Leídos (Aperturas)</div>
                    <div className="waKpiCard__value">{selected.readCount}</div>
                    <div className="waKpiCard__desc">{percent(selected.readCount, selected.deliveredCount || selected.sentCount).toFixed(0)}% de efectividad</div>
                  </div>

                  <div className="waKpiCard waKpiCard--red">
                    <div className="waKpiCard__title">Errores</div>
                    <div className="waKpiCard__value">{selected.failedCount}</div>
                  </div>
                </div>

                <div className="waFilterRow">
                  <h3 className="waFilterRow__title">Detalle de Destinatarios</h3>
                  <select
                    className="waFilterRow__select"
                    value={metricsFilter}
                    onChange={(e) => setMetricsFilter(e.target.value as StatusValue | 'all')}
                  >
                    <option value="all">Ver todos los registros</option>
                    <option value="read">Solo Leídos (Aperturas)</option>
                    <option value="delivered">Solo Entregados (Sin leer)</option>
                    <option value="sent">Solo Enviados</option>
                    <option value="failed">Errores / Fallidos</option>
                  </select>
                </div>

                <div className="waTableWrap" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <table className="waTable waTable--clean">
                    <thead>
                      <tr>
                        <th>Teléfono</th>
                        <th>Nombre</th>
                        <th>Estado Tracker</th>
                        <th>Última Actividad</th>
                        <th>Motivo de Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((it) => (
                        <tr key={it.id}>
                          <td style={{ fontWeight: '500' }}>{it.to}</td>
                          <td style={{ color: '#64748b' }}>{it.name || '—'}</td>
                          <td>{getStatusBadge(it.status)}</td>
                          <td style={{ color: '#64748b', fontSize: '13px' }}>{toLocal(it.updatedAt)}</td>
                          <td className="waTdErr" style={{ fontSize: '13px' }}>{it.lastError || '—'}</td>
                        </tr>
                      ))}
                      {!filteredItems.length && (
                        <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No hay destinatarios con este estado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}