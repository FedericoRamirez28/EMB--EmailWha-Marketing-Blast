import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/useAuth' // <- ajustá si tu path es distinto

function getApiBase(): string {
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

/* =========================
   ✅ Safe parsing helpers (sin any)
   ========================= */
type AnyRecord = Record<string, unknown>

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null
}
function getString(o: AnyRecord, k: string): string | undefined {
  const v = o[k]
  return typeof v === 'string' ? v : undefined
}
function getNumber(o: AnyRecord, k: string): number | undefined {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function getBool(o: AnyRecord, k: string): boolean | undefined {
  const v = o[k]
  return typeof v === 'boolean' ? v : undefined
}
function getRecord(o: AnyRecord, k: string): AnyRecord | undefined {
  const v = o[k]
  return isRecord(v) ? v : undefined
}
function getArray(o: AnyRecord, k: string): unknown[] | undefined {
  const v = o[k]
  return Array.isArray(v) ? v : undefined
}
function clampInt(n: number, min: number, max: number): number {
  const x = Math.trunc(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, x))
}
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

/* =========================
   ✅ UX: visibilidad de pestaña
   ========================= */
function usePageVisible(): boolean {
  const initial =
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  const [visible, setVisible] = useState<boolean>(initial)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return visible
}

/* =========================
   Types UI
   ========================= */
type UiStatus = 'idle' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
type StatusValue = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

type SendRespOk = {
  ok: true
  id: string
  whapiMessageId: string | null
  status: 'sent' | 'pending'
  data?: unknown
}
type SendRespErr = {
  ok: false
  error: string
  id?: string
  status?: 'failed'
}
type SendResp = SendRespOk | SendRespErr

type StatusRespOk = {
  ok: true
  data: {
    id: string
    to: string
    status: StatusValue
    error: string | null
    whapiMessageId: string | null
    createdAt: string
    sentAt: string | null
    deliveredAt: string | null
    readAt: string | null
  }
}
type StatusRespErr = { ok: false; error: string }
type StatusResp = StatusRespOk | StatusRespErr

type HealthResp =
  | { ok: true; configured: boolean; baseUrl: string }
  | { ok: false; error: string }

type CampaignStatus = 'draft' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed'

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
  maxRetries: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

type CampaignItemRow = {
  id: string
  to: string
  name: string | null
  status: string
  attempts: number
  lastError: string | null
  updatedAt: string
  messageId: string | null
}

type CampaignDetailOk = {
  ok: true
  data: CampaignRow & {
    body: string
    blockId: number | null
    tags: string | null
    requireAllTags: boolean
    items: CampaignItemRow[]
  }
}
type CampaignDetailErr = { ok: false; error: string }
type CampaignDetail = CampaignDetailOk | CampaignDetailErr

type CreateCampaignResp = { ok: true; id: string } | { ok: false; error: string }
type ListCampaignsResp = { ok: true; data: CampaignRow[] } | { ok: false; error: string }

type TabKey = 'test' | 'campaigns' | 'metrics'

type BlockCfg = { id: number; name: string; capacity: number }

type ImportPhonesResp =
  | { ok: true; inserted: number; updated: number; skipped: number }
  | { ok: false; error: string }

/* =========================
   ✅ Parsers (unknown -> typed)
   ========================= */
function parseHealthResp(u: unknown): HealthResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  const ok = getBool(u, 'ok')
  if (ok !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  return {
    ok: true,
    configured: Boolean(getBool(u, 'configured')),
    baseUrl: getString(u, 'baseUrl') ?? '',
  }
}

function parseSendResp(u: unknown): SendResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  const ok = getBool(u, 'ok')
  if (ok !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  return {
    ok: true,
    id: getString(u, 'id') ?? '',
    whapiMessageId: getString(u, 'whapiMessageId') ?? null,
    status: (getString(u, 'status') as 'sent' | 'pending' | undefined) ?? 'sent',
    data: u['data'],
  }
}

function parseStatusResp(u: unknown): StatusResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  const ok = getBool(u, 'ok')
  if (ok !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }

  const d = getRecord(u, 'data')
  if (!d) return { ok: false, error: 'Respuesta inválida (data)' }

  const statusRaw = getString(d, 'status') ?? 'pending'
  const status: StatusValue = (['pending', 'sent', 'delivered', 'read', 'failed'] as const).includes(
    statusRaw as StatusValue,
  )
    ? (statusRaw as StatusValue)
    : 'pending'

  return {
    ok: true,
    data: {
      id: getString(d, 'id') ?? '',
      to: getString(d, 'to') ?? '',
      status,
      error: getString(d, 'error') ?? null,
      whapiMessageId: getString(d, 'whapiMessageId') ?? null,
      createdAt: getString(d, 'createdAt') ?? new Date().toISOString(),
      sentAt: getString(d, 'sentAt') ?? null,
      deliveredAt: getString(d, 'deliveredAt') ?? null,
      readAt: getString(d, 'readAt') ?? null,
    },
  }
}

function parseCampaignRow(u: unknown): CampaignRow | null {
  if (!isRecord(u)) return null
  const id = getString(u, 'id')
  const name = getString(u, 'name')
  const status = getString(u, 'status') as CampaignStatus | undefined
  if (!id || !name || !status) return null

  const num = (k: string, fallback = 0) => clampInt(getNumber(u, k) ?? fallback, 0, 1_000_000_000)
  const createdAt = getString(u, 'createdAt') ?? new Date().toISOString()

  return {
    id,
    name,
    status,
    total: num('total'),
    doneCount: num('doneCount'),
    sentCount: num('sentCount'),
    deliveredCount: num('deliveredCount'),
    readCount: num('readCount'),
    failedCount: num('failedCount'),
    skippedCount: num('skippedCount'),
    delayMs: num('delayMs', 2500),
    maxRetries: num('maxRetries', 2),
    createdAt,
    startedAt: getString(u, 'startedAt') ?? null,
    finishedAt: getString(u, 'finishedAt') ?? null,
  }
}

function parseListCampaignsResp(u: unknown): ListCampaignsResp {
  if (!isRecord(u)) return { ok: false, error: 'Respuesta inválida' }
  if (getBool(u, 'ok') !== true) return { ok: false, error: getString(u, 'error') ?? 'Error' }
  const arr = getArray(u, 'data')
  if (!arr) return { ok: true, data: [] }
  const rows: CampaignRow[] = arr.map(parseCampaignRow).filter((x): x is CampaignRow => Boolean(x))
  return { ok: true, data: rows }
}

function parseCampaignItemRow(u: unknown): CampaignItemRow | null {
  if (!isRecord(u)) return null
  const id = getString(u, 'id')
  const to = getString(u, 'to')
  if (!id || !to) return null
  return {
    id,
    to,
    name: getString(u, 'name') ?? null,
    status: getString(u, 'status') ?? 'pending',
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
  const items: CampaignItemRow[] = itemsArr.map(parseCampaignItemRow).filter((x): x is CampaignItemRow => Boolean(x))

  return {
    ok: true,
    data: {
      ...row,
      body: getString(data, 'body') ?? '',
      blockId: getNumber(data, 'blockId') ?? null,
      tags: getString(data, 'tags') ?? null,
      requireAllTags: Boolean(getBool(data, 'requireAllTags')),
      items,
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
    const id = getNumber(row, 'id')
    const name = getString(row, 'name')
    const capacity = getNumber(row, 'capacity')
    if (typeof id === 'number' && typeof name === 'string' && typeof capacity === 'number') {
      out.push({ id, name, capacity })
    }
  }
  return out.sort((a, b) => a.id - b.id)
}

/* =========================
   CSV helpers (import phones)
   ========================= */
function parseImportCsv(text: string): Array<{ phone: string; name?: string }> {
  const lines = String(text ?? '')
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const rows: Array<{ phone: string; name?: string }> = []
  for (const line of lines) {
    // soporta: "phone" o "phone,name"
    const parts = line.split(',').map((x) => x.trim())
    const phone = normPhone(parts[0] ?? '')
    const name = (parts[1] ?? '').trim()
    if (!phone) continue
    rows.push(name ? { phone, name } : { phone })
  }
  return rows
}

/* =========================
   Auto refresh config (localStorage)
   ========================= */
const LS_WA_AUTO = 'wa_auto_refresh_v1'
const LS_WA_INTERVAL = 'wa_auto_refresh_interval_v1'

function readLsBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
    return fallback
  } catch {
    return fallback
  }
}
function writeLsBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    // ignore
  }
}
function readLsInt(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : fallback
  } catch {
    return fallback
  }
}
function writeLsInt(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.trunc(v)))
  } catch {
    // ignore
  }
}

/* =========================
   Component
   ========================= */
export function WhatsappScreen() {
  const apiBase = useMemo(() => getApiBase(), [])
  const { token } = useAuth()
  const pageVisible = usePageVisible()

  const [configured, setConfigured] = useState<boolean>(false)

  // Tabs
  const [tab, setTab] = useState<TabKey>('campaigns')

  // ===== Anti-polling: manual refresh + auto toggle =====
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => readLsBool(LS_WA_AUTO, false)) // OFF por defecto
  const [autoEveryMs, setAutoEveryMs] = useState<number>(() => clampInt(readLsInt(LS_WA_INTERVAL, 15000), 5000, 60000))
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [lastUpdated, setLastUpdated] = useState<string>('—')

  function bumpRefresh(): void {
    setRefreshKey((x) => x + 1)
  }

  // ===== TEST =====
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')
  const [out, setOut] = useState<string>('')
  const [uiStatus, setUiStatus] = useState<UiStatus>('idle')
  const [internalId, setInternalId] = useState<string | null>(null)
  const toNorm = useMemo(() => normPhone(to), [to])

  // ===== BLOCKS (desde /blocks con JWT) =====
  const [blocks, setBlocks] = useState<BlockCfg[]>([])
  const [blocksMsg, setBlocksMsg] = useState<string>('')

  // ===== IMPORT PHONES =====
  const [impBlockId, setImpBlockId] = useState<string>('') // select
  const [impTags, setImpTags] = useState<string>('')
  const [impCsv, setImpCsv] = useState<string>('')
  const [impOut, setImpOut] = useState<string>('')

  // ===== CAMPAIGNS =====
  const [campName, setCampName] = useState('Campaña WhatsApp')
  const [campBody, setCampBody] = useState('')
  const [campTags, setCampTags] = useState('')
  const [campRequireAll, setCampRequireAll] = useState(false)

  const [campBlockId, setCampBlockId] = useState<string>('') // select
  const [campDelayMs, setCampDelayMs] = useState<number>(2500)
  const [campMaxRetries, setCampMaxRetries] = useState<number>(2)

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null)
  const [campMsg, setCampMsg] = useState<string>('')

  // ===== Locks anti doble click (evita duplicados) =====
  const lockSend = useRef(false)
  const lockImport = useRef(false)
  const lockCreate = useRef(false)
  const lockAction = useRef(false)

  // Health/config (liviano: 1 llamada al montar o cambiar token)
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
        if (!alive) return
        setConfigured(false)
      }
    }

    void run()
    return () => {
      alive = false
    }
  }, [apiBase, token])

  /* =========================
     ✅ Blocks: solo tab campaigns (y autoRefresh opcional)
     ========================= */
  useEffect(() => {
    if (tab !== 'campaigns') return

    let alive = true
    let t: number | null = null

    const load = async () => {
      if (!token) {
        if (alive) {
          setBlocks([])
          setBlocksMsg('Sin token (login). No se pueden listar bloques.')
        }
        return
      }

      try {
        const r = await fetch(`${apiBase}/blocks`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        if (!alive) return
        const parsed = parseBlocksResp(j)
        setBlocks(parsed)
        setBlocksMsg('')
        setLastUpdated(new Date().toLocaleTimeString())
      } catch (e: unknown) {
        if (!alive) return
        setBlocks([])
        setBlocksMsg(errToMessage(e))
      } finally {
        if (alive && autoRefresh && pageVisible) {
          t = window.setTimeout(() => void load(), autoEveryMs)
        }
      }
    }

    void load()
    return () => {
      alive = false
      if (t) window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, token, tab, autoRefresh, autoEveryMs, pageVisible, refreshKey])

  /* =========================
     ✅ Status TEST: solo tab test + internalId
     - autoRefresh opcional
     - stop en read/failed
     ========================= */
  useEffect(() => {
    if (tab !== 'test') return
    if (!internalId) return

    let alive = true
    let timer: number | null = null

    const tick = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/status/${internalId}`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const s = parseStatusResp(j)
        if (!alive) return

        if (!s.ok) {
          if (alive && autoRefresh && pageVisible) {
            timer = window.setTimeout(() => void tick(), autoEveryMs)
          }
          return
        }

        const st = s.data.status
        const err = s.data.error

        if (st === 'failed') {
          setUiStatus('failed')
          setOut(JSON.stringify({ ok: false, error: err ?? 'failed', status: st }, null, 2))
          setLastUpdated(new Date().toLocaleTimeString())
          return // stop
        }

        if (st === 'read') {
          setUiStatus('read')
          setLastUpdated(new Date().toLocaleTimeString())
          return // stop
        }

        if (st === 'delivered') setUiStatus('delivered')
        else if (st === 'sent') setUiStatus('sent')
        else setUiStatus('sending')

        setLastUpdated(new Date().toLocaleTimeString())

        if (alive && autoRefresh && pageVisible) {
          timer = window.setTimeout(() => void tick(), autoEveryMs)
        }
      } catch {
        if (!alive) return
        if (autoRefresh && pageVisible) {
          timer = window.setTimeout(() => void tick(), autoEveryMs)
        }
      }
    }

    void tick()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
  }, [apiBase, internalId, token, tab, autoRefresh, autoEveryMs, pageVisible, refreshKey])

  /* =========================
     ✅ List campaigns: solo tab campaigns/metrics + autoRefresh opcional
     ========================= */
  useEffect(() => {
    if (tab !== 'campaigns' && tab !== 'metrics') return

    let alive = true
    let t: number | null = null

    const load = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/campaigns`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const resp = parseListCampaignsResp(j)
        if (!alive) return
        if (resp.ok) {
          setCampaigns(resp.data)
          setLastUpdated(new Date().toLocaleTimeString())
        }
      } catch {
        // ignore
      } finally {
        if (alive && autoRefresh && pageVisible) {
          t = window.setTimeout(() => void load(), autoEveryMs)
        }
      }
    }

    void load()
    return () => {
      alive = false
      if (t) window.clearTimeout(t)
    }
  }, [apiBase, token, tab, autoRefresh, autoEveryMs, pageVisible, refreshKey])

  /* =========================
     ✅ Campaign detail: solo cuando hay selectedCampaignId
     - autoRefresh opcional
     - stop si status done/cancelled/failed
     ========================= */
  useEffect(() => {
    if (tab !== 'metrics') return
    if (!selectedCampaignId) return

    let alive = true
    let t: number | null = null

    const load = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/campaign/${selectedCampaignId}`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const resp = parseCampaignDetail(j)
        if (!alive) return
        setCampaignDetail(resp)
        setLastUpdated(new Date().toLocaleTimeString())

        const st: CampaignStatus | null = resp.ok ? resp.data.status : null
        const finished = st === 'done' || st === 'cancelled' || st === 'failed'

        if (alive && autoRefresh && pageVisible && !finished) {
          t = window.setTimeout(() => void load(), autoEveryMs)
        }
      } catch {
        // ignore
        if (alive && autoRefresh && pageVisible) {
          t = window.setTimeout(() => void load(), autoEveryMs)
        }
      }
    }

    void load()
    return () => {
      alive = false
      if (t) window.clearTimeout(t)
    }
  }, [apiBase, selectedCampaignId, token, tab, autoRefresh, autoEveryMs, pageVisible, refreshKey])

  async function sendTest(): Promise<void> {
    if (lockSend.current) return
    lockSend.current = true

    setOut('Enviando...')
    setUiStatus('sending')
    setInternalId(null)

    try {
      const r = await fetch(`${apiBase}/whapi/send`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ to: toNorm, body }),
      })

      const parsed: unknown = await r.json().catch(() => null)
      const resp = parseSendResp(parsed)

      if (!resp.ok || !resp.id) {
        setUiStatus('failed')
        setOut(JSON.stringify(resp, null, 2))
        return
      }

      setUiStatus('sent')
      setInternalId(resp.id)
      setOut(JSON.stringify(resp, null, 2))
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (e: unknown) {
      setUiStatus('failed')
      setOut(JSON.stringify({ ok: false, error: errToMessage(e) }, null, 2))
    } finally {
      lockSend.current = false
    }
  }

  async function importPhones(): Promise<void> {
    if (lockImport.current) return
    lockImport.current = true

    setImpOut('Importando...')
    try {
      if (!token) {
        setImpOut('Error: no hay token. Iniciá sesión.')
        return
      }

      const blockIdNum = Number(impBlockId)
      if (!Number.isFinite(blockIdNum) || blockIdNum <= 0) {
        setImpOut('Elegí un bloque válido.')
        return
      }

      const rows = parseImportCsv(impCsv)
      if (!rows.length) {
        setImpOut('CSV vacío o inválido. Formato: 54911xxxxxxx o 54911xxxxxxx,Nombre')
        return
      }

      const payload = {
        blockId: blockIdNum,
        tags: impTags.trim() || undefined,
        rows,
      }

      const r = await fetch(`${apiBase}/whapi/recipients/import-phones`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      })

      const j: unknown = await r.json().catch(() => null)
      const ok = isRecord(j) && getBool(j, 'ok') === true
      if (!ok) {
        const msg = isRecord(j) ? getString(j, 'error') || getString(j, 'message') || 'Error' : 'Error'
        setImpOut(`Error: ${msg}`)
        return
      }

      const resp = j as ImportPhonesResp
      setImpOut(JSON.stringify(resp, null, 2))
      setImpCsv('')
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (e: unknown) {
      setImpOut(errToMessage(e))
    } finally {
      lockImport.current = false
    }
  }

  async function createCampaign(): Promise<void> {
    if (lockCreate.current) return
    lockCreate.current = true

    setCampMsg('Creando campaña...')
    try {
      const blockIdNum = campBlockId.trim() ? Number(campBlockId.trim()) : NaN

      const payload: Record<string, unknown> = {
        name: campName.trim() || 'Campaña WhatsApp',
        body: campBody,
        tags: campTags.trim() || undefined,
        requireAllTags: campRequireAll,
        delayMs: clampInt(Number(campDelayMs || 0), 250, 3_600_000),
        maxRetries: clampInt(Number(campMaxRetries || 0), 0, 50),
      }

      if (Number.isFinite(blockIdNum)) payload.blockId = blockIdNum

      const r = await fetch(`${apiBase}/whapi/campaign`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      })

      const j: unknown = await r.json().catch(() => null)
      const resp = parseCreateCampaignResp(j)

      if (resp.ok && resp.id) {
        setCampMsg('Campaña creada ✅')
        setSelectedCampaignId(resp.id)
        setTab('metrics')
        setLastUpdated(new Date().toLocaleTimeString())
        return
      }

      setCampMsg(resp.ok ? 'OK' : resp.error)
    } catch (e: unknown) {
      setCampMsg(errToMessage(e))
    } finally {
      lockCreate.current = false
    }
  }

  async function campaignAction(path: string): Promise<void> {
    if (!selectedCampaignId) return
    if (lockAction.current) return
    lockAction.current = true

    try {
      setCampMsg('Procesando...')
      const r = await fetch(`${apiBase}/whapi/campaign/${selectedCampaignId}/${path}`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      const j: unknown = await r.json().catch(() => null)
      setCampMsg(isRecord(j) ? JSON.stringify(j, null, 2) : 'OK')
      setLastUpdated(new Date().toLocaleTimeString())
      bumpRefresh() // refresca métricas luego de acciones
    } catch (e: unknown) {
      setCampMsg(errToMessage(e))
    } finally {
      lockAction.current = false
    }
  }

  function percent(done: number, total: number) {
    if (!total) return 0
    const p = (done / total) * 100
    return Math.max(0, Math.min(100, p))
  }

  const canSendTest = Boolean(configured && toNorm && body.trim() && uiStatus !== 'sending')
  const canImport = Boolean(configured && impBlockId && impCsv.trim() && token)
  const canCreate = Boolean(configured && campBody.trim())

  const effectiveDetail = selectedCampaignId ? campaignDetail : null
  const selected = effectiveDetail?.ok ? effectiveDetail.data : null
  const progress = selected ? percent(selected.doneCount, selected.total) : 0

  function onToggleAuto(v: boolean) {
    setAutoRefresh(v)
    writeLsBool(LS_WA_AUTO, v)
  }
  function onChangeInterval(v: number) {
    const ms = clampInt(v, 5000, 60000)
    setAutoEveryMs(ms)
    writeLsInt(LS_WA_INTERVAL, ms)
  }

  return (
    <div className="waScreen">
      <div className="waScreen__head">
        <div className="waScreen__title">WhatsApp masivo</div>
        <div className="waScreen__subtitle">Whapi + campañas + tracking (sent/delivered/read)</div>

        <div className="waScreen__meta">
          <span className={`waPill ${configured ? 'waPill--ok' : 'waPill--warn'}`}>
            {configured ? 'Whapi configurado' : 'Whapi no configurado'}
          </span>
          <span className="waPill waPill--muted">API: {apiBase || '—'}</span>

          <span className={`waPill ${pageVisible ? 'waPill--muted' : 'waPill--warn'}`}>
            {pageVisible ? 'Pestaña activa' : 'Pestaña en background (pausado)'}
          </span>

          <span className="waPill waPill--muted">Últ. update: {lastUpdated}</span>

          {blocksMsg ? <span className="waPill waPill--warn">{blocksMsg}</span> : null}
        </div>

        {/* Controls anti-polling */}
        <div className="waScreen__actions" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <button className="waBtn" type="button" onClick={() => bumpRefresh()}>
            Actualizar
          </button>

          <div className="waCheck">
            <input
              id="waAuto"
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onToggleAuto(e.target.checked)}
            />
            <label htmlFor="waAuto">Auto-actualizar</label>
          </div>

          <select
            className="waScreen__input"
            style={{ width: 160 }}
            value={String(autoEveryMs)}
            onChange={(e) => onChangeInterval(Number(e.target.value))}
            disabled={!autoRefresh}
            title="Intervalo de auto-actualización"
          >
            <option value="5000">Cada 5s</option>
            <option value="10000">Cada 10s</option>
            <option value="15000">Cada 15s</option>
            <option value="30000">Cada 30s</option>
            <option value="60000">Cada 60s</option>
          </select>

          <div className="waScreen__note" style={{ margin: 0 }}>
            Tip: dejá <b>Auto-actualizar</b> apagado en Trial para no gastar solicitudes.
          </div>
        </div>

        <div className="waTabs">
          <button
            className={`waTab ${tab === 'test' ? 'waTab--active' : ''}`}
            onClick={() => setTab('test')}
            type="button"
          >
            Prueba
          </button>
          <button
            className={`waTab ${tab === 'campaigns' ? 'waTab--active' : ''}`}
            onClick={() => setTab('campaigns')}
            type="button"
          >
            Campañas
          </button>
          <button
            className={`waTab ${tab === 'metrics' ? 'waTab--active' : ''}`}
            onClick={() => setTab('metrics')}
            type="button"
          >
            Métricas
          </button>
        </div>
      </div>

      {tab === 'test' && (
        <>
          <div className="waScreen__card">
            <div className="waRow" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                className={[
                  'waPill',
                  uiStatus === 'idle' ? 'waPill--muted' : '',
                  uiStatus === 'sending' ? 'waPill--muted' : '',
                  uiStatus === 'sent' ? 'waPill--sent' : '',
                  uiStatus === 'delivered' ? 'waPill--delivered' : '',
                  uiStatus === 'read' ? 'waPill--read' : '',
                  uiStatus === 'failed' ? 'waPill--failed' : '',
                ].join(' ')}
                title={internalId ? `ID interno: ${internalId}` : ''}
              >
                {uiStatus === 'idle' && 'Estado: —'}
                {uiStatus === 'sending' && 'Enviando…'}
                {uiStatus === 'sent' && 'Enviado'}
                {uiStatus === 'delivered' && 'Entregado'}
                {uiStatus === 'read' && 'Leído'}
                {uiStatus === 'failed' && 'Error'}
              </span>

              <button className="waBtn" type="button" onClick={() => bumpRefresh()} disabled={!internalId}>
                Actualizar estado
              </button>
            </div>

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
                onClick={() => void sendTest()}
                disabled={!canSendTest}
              >
                Enviar prueba
              </button>
            </div>
          </div>

          <div className="waScreen__log">
            <div className="waScreen__logTitle">Respuesta</div>
            <pre className="waScreen__pre">{out || '—'}</pre>
          </div>
        </>
      )}

      {tab === 'campaigns' && (
        <div className="waScreen__card">
          {/* =======================
              IMPORTAR NÚMEROS (CSV)
              ======================= */}
          <div className="waSectionTitle">Importar números (CSV)</div>

          <div className="waGrid2">
            <label className="waScreen__field">
              <span className="waScreen__label">Bloque destino</span>
              <select className="waScreen__input" value={impBlockId} onChange={(e) => setImpBlockId(e.target.value)}>
                <option value="">— Elegir bloque —</option>
                {blocks
                  .filter((b) => b.id > 0)
                  .map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} (ID {b.id})
                    </option>
                  ))}
              </select>
              <div className="waScreen__hint">Tip: creá/edita bloques en “Destinatarios” (igual que Email).</div>
            </label>

            <label className="waScreen__field">
              <span className="waScreen__label">Tags opcionales (CSV)</span>
              <input
                className="waScreen__input"
                value={impTags}
                onChange={(e) => setImpTags(e.target.value)}
                placeholder="Ej: ventas,frio,medic"
              />
              <div className="waScreen__hint">Se guardan en el Recipient para filtrar campañas.</div>
            </label>

            <label className="waScreen__field waGrid2__span2">
              <span className="waScreen__label">Pegar CSV (una fila por línea)</span>
              <textarea
                className="waScreen__textarea"
                value={impCsv}
                onChange={(e) => setImpCsv(e.target.value)}
                rows={6}
                placeholder={`Ej:\n5491122334455,Juan Perez\n5491199988877`}
              />
            </label>
          </div>

          <div className="waScreen__actions">
            <button className="waScreen__primary" type="button" disabled={!canImport} onClick={() => void importPhones()}>
              Importar números al bloque
            </button>
            <button className="waBtn" type="button" onClick={() => bumpRefresh()}>
              Actualizar listados
            </button>
          </div>

          <div className="waMiniLog">
            <div className="waMiniLog__title">Salida importación</div>
            <pre className="waMiniLog__pre">{impOut || '—'}</pre>
          </div>

          <div className="waHr" />

          {/* =======================
              CREAR CAMPAÑA
              ======================= */}
          <div className="waSectionTitle">Crear campaña</div>

          <div className="waGrid2">
            <label className="waScreen__field">
              <span className="waScreen__label">Nombre campaña</span>
              <input className="waScreen__input" value={campName} onChange={(e) => setCampName(e.target.value)} />
            </label>

            <label className="waScreen__field">
              <span className="waScreen__label">Bloque (opcional)</span>
              <select className="waScreen__input" value={campBlockId} onChange={(e) => setCampBlockId(e.target.value)}>
                <option value="">— Todos los bloques —</option>
                {blocks
                  .filter((b) => b.id > 0)
                  .map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} (ID {b.id})
                    </option>
                  ))}
              </select>
            </label>

            <label className="waScreen__field">
              <span className="waScreen__label">Tags (CSV, opcional)</span>
              <input
                className="waScreen__input"
                value={campTags}
                onChange={(e) => setCampTags(e.target.value)}
                placeholder="Ej: ventas,frio,medic"
              />
              <div className="waCheck">
                <input
                  id="requireAll"
                  type="checkbox"
                  checked={campRequireAll}
                  onChange={(e) => setCampRequireAll(e.target.checked)}
                />
                <label htmlFor="requireAll">Requerir TODOS los tags</label>
              </div>
            </label>

            <label className="waScreen__field">
              <span className="waScreen__label">Delay entre mensajes (ms)</span>
              <input
                className="waScreen__input"
                value={String(campDelayMs)}
                onChange={(e) => setCampDelayMs(Number(e.target.value || 0))}
                inputMode="numeric"
              />
            </label>

            <label className="waScreen__field">
              <span className="waScreen__label">Max reintentos por destinatario</span>
              <input
                className="waScreen__input"
                value={String(campMaxRetries)}
                onChange={(e) => setCampMaxRetries(Number(e.target.value || 0))}
                inputMode="numeric"
              />
              <div className="waScreen__hint">
                Tip: en Trial probá con <b>0</b> para no gastar mensajes en retries.
              </div>
            </label>

            <label className="waScreen__field waGrid2__span2">
              <span className="waScreen__label">Mensaje campaña</span>
              <textarea
                className="waScreen__textarea"
                value={campBody}
                onChange={(e) => setCampBody(e.target.value)}
                rows={6}
                placeholder="Texto que se enviará a todos..."
              />
            </label>
          </div>

          <div className="waScreen__actions">
            <button className="waScreen__primary" type="button" disabled={!canCreate} onClick={() => void createCampaign()}>
              Crear y ejecutar campaña
            </button>
            <div className="waScreen__note">
              Requiere que los destinatarios tengan <b>phone</b> cargado. Filtra por bloque y/o tags.
            </div>
          </div>

          <div className="waMiniLog">
            <div className="waMiniLog__title">Salida</div>
            <pre className="waMiniLog__pre">{campMsg || '—'}</pre>
          </div>

          <div className="waCampaignList">
            <div className="waCampaignList__title">Últimas campañas</div>
            <div className="waTableWrap">
              <table className="waTable">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Done</th>
                    <th>Failed</th>
                    <th>Delay</th>
                    <th>Retries</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className={selectedCampaignId === c.id ? 'isActive' : ''}>
                      <td>{c.name}</td>
                      <td>{c.status}</td>
                      <td>{c.total}</td>
                      <td>{c.doneCount}</td>
                      <td>{c.failedCount}</td>
                      <td>{c.delayMs}ms</td>
                      <td>{c.maxRetries}</td>
                      <td>
                        <button className="waLinkBtn" type="button" onClick={() => setSelectedCampaignId(c.id)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!campaigns.length && (
                    <tr>
                      <td colSpan={8} style={{ opacity: 0.7 }}>
                        — Sin campañas —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="waScreen__note">
              Tip: abrí una campaña en “Ver” y mirala en la pestaña <b>Métricas</b>.
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div className="waScreen__card">
          {!selected ? (
            <div className="waScreen__note">Elegí una campaña en la pestaña Campañas → “Ver”.</div>
          ) : (
            <>
              <div className="waMetricsHead">
                <div className="waMetricsHead__left">
                  <div className="waMetricsHead__title">{selected.name}</div>
                  <div className="waMetricsHead__sub">
                    Status: <b>{selected.status}</b> · Total: <b>{selected.total}</b> · Done: <b>{selected.doneCount}</b>
                  </div>
                </div>
                <div className="waMetricsHead__actions">
                  <button className="waBtn" type="button" onClick={() => bumpRefresh()}>
                    Actualizar
                  </button>
                  <button className="waBtn" type="button" onClick={() => void campaignAction('resume')}>
                    Reanudar
                  </button>
                  <button className="waBtn" type="button" onClick={() => void campaignAction('retry-failed')}>
                    Reintentar fallidos
                  </button>
                  <button className="waBtn waBtn--danger" type="button" onClick={() => void campaignAction('cancel')}>
                    Cancelar
                  </button>
                </div>
              </div>

              <div className="waProgress">
                <div className="waProgress__bar">
                  <div className="waProgress__fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="waProgress__txt">{progress.toFixed(1)}%</div>
              </div>

              <div className="waCards">
                <div className="waCardKpi">
                  <div className="waCardKpi__k">Enviados</div>
                  <div className="waCardKpi__v">{selected.sentCount}</div>
                </div>
                <div className="waCardKpi">
                  <div className="waCardKpi__k">Entregados</div>
                  <div className="waCardKpi__v">{selected.deliveredCount}</div>
                </div>
                <div className="waCardKpi">
                  <div className="waCardKpi__k">Leídos</div>
                  <div className="waCardKpi__v">{selected.readCount}</div>
                </div>
                <div className="waCardKpi">
                  <div className="waCardKpi__k">Fallidos</div>
                  <div className="waCardKpi__v">{selected.failedCount}</div>
                </div>
              </div>

              <div className="waTableWrap">
                <table className="waTable">
                  <thead>
                    <tr>
                      <th>To</th>
                      <th>Nombre</th>
                      <th>Estado</th>
                      <th>Intentos</th>
                      <th>Error</th>
                      <th>Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.to}</td>
                        <td>{it.name || '—'}</td>
                        <td>{it.status}</td>
                        <td>{it.attempts}</td>
                        <td className="waTdErr">{it.lastError || '—'}</td>
                        <td>{toLocal(it.updatedAt)}</td>
                      </tr>
                    ))}
                    {!selected.items.length && (
                      <tr>
                        <td colSpan={6} style={{ opacity: 0.7 }}>
                          — Sin items aún —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="waMiniLog">
                <div className="waMiniLog__title">Salida</div>
                <pre className="waMiniLog__pre">{campMsg || '—'}</pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
