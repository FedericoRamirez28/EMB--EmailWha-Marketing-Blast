// src/components/screens/WhatsappScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'
import { useAuth } from '@/auth/useAuth'
import WaRecipientsPanel from '@/components/ui/WaRecipientsPanel'

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
   Normalización
   ========================= */
function safeStr(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') return String(raw)
  return ''
}

function normName(raw: unknown): string {
  return safeStr(raw).replace(/\s+/g, ' ').trim()
}

function onlyDigits(raw: unknown): string {
  return safeStr(raw).replace(/[^\d]/g, '').trim()
}

/**
 * Normaliza teléfonos AR:
 * - 549... => ok
 * - 54...  => agrega 9
 * - 11XXXXXXXX => 54911XXXXXXXX
 * - 15XXXXXXXX => 54911XXXXXXXX (15 -> 11)
 * - XXXXXXXX (8 dígitos) => 54911 + XXXXXXXX (default área 11)
 * - 011... => quita 0 inicial
 */
function normalizeArPhone(raw: unknown, defaultArea = '11'): string {
  let s = onlyDigits(raw)
  if (s.startsWith('0')) s = s.replace(/^0+/, '')
  if (s.startsWith('549') && s.length >= 12) return s
  if (s.startsWith('54') && !s.startsWith('549')) {
    s = '549' + s.slice(2)
    return s
  }
  if (s.length === 10 && s.startsWith('15')) {
    s = defaultArea + s.slice(2)
    return '549' + s
  }
  if (s.length === 10 && s.startsWith(defaultArea)) {
    return '549' + s
  }
  if (s.length === 8) {
    return '549' + defaultArea + s
  }
  return s
}

/** Parsea TXT/CSV pegado aceptando separadores: tab, coma, ;, | */
function parseImportTextSmart(text: string): Array<{ phone: string; name?: string }> {
  const lines = safeStr(text)
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: Array<{ phone: string; name?: string }> = []

  for (const line of lines) {
    const parts = line
      .split(/[\t,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)

    if (!parts.length) continue

    const candA = onlyDigits(parts[0] ?? '')
    const candB = onlyDigits(parts[1] ?? '')
    const aLooksPhone = candA.length >= 8
    const bLooksPhone = candB.length >= 8

    let phoneRaw: unknown = ''
    let nameRaw: unknown = ''

    if (aLooksPhone && !bLooksPhone) {
      phoneRaw = parts[0] ?? ''
      nameRaw = parts[1] ?? ''
    } else if (!aLooksPhone && bLooksPhone) {
      nameRaw = parts[0] ?? ''
      phoneRaw = parts[1] ?? ''
    } else {
      phoneRaw = parts[0] ?? ''
      nameRaw = parts[1] ?? ''
    }

    const phone = normalizeArPhone(phoneRaw)
    if (!phone) continue

    const name = normName(nameRaw)
    out.push(name ? { phone, name } : { phone })
  }

  return out
}

/** XLS/XLSX: Col A nombre, Col B número (o viceversa). */
async function parseImportXlsx(file: File): Promise<Array<{ phone: string; name?: string }>> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames?.[0]
  if (!sheetName) return []

  const sheetsUnknown: unknown = (wb as unknown as { Sheets?: unknown }).Sheets
  const sheetsRec: AnyRecord | null = isRecord(sheetsUnknown) ? sheetsUnknown : null
  if (!sheetsRec) return []

  const wsUnknown: unknown = sheetsRec[sheetName]
  if (!isRecord(wsUnknown)) return []
  const ws = wsUnknown as unknown as XLSX.WorkSheet

  const utilsUnknown: unknown = XLSX.utils as unknown
  const utilsRec: AnyRecord | null = isRecord(utilsUnknown) ? utilsUnknown : null
  if (!utilsRec) return []

  const fnUnknown: unknown = utilsRec['sheet_to_json']
  if (typeof fnUnknown !== 'function') return []

  const rowsUnknown: unknown = (fnUnknown as (
    this: unknown,
    ws: XLSX.WorkSheet,
    opts: XLSX.Sheet2JSONOpts,
  ) => unknown).call(utilsRec, ws, { header: 1, raw: true })

  const rows: unknown[] = Array.isArray(rowsUnknown) ? rowsUnknown : []

  const out: Array<{ phone: string; name?: string }> = []

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue

    const r = row as unknown[]
    const c0 = r[0]
    const c1 = r[1]

    const d0 = onlyDigits(c0)
    const d1 = onlyDigits(c1)

    const c0LooksPhone = d0.length >= 8
    const c1LooksPhone = d1.length >= 8

    let nameRaw: unknown = ''
    let phoneRaw: unknown = ''

    if (!c0LooksPhone && c1LooksPhone) {
      nameRaw = c0
      phoneRaw = c1
    } else if (c0LooksPhone && !c1LooksPhone) {
      phoneRaw = c0
      nameRaw = c1
    } else {
      nameRaw = c0
      phoneRaw = c1
    }

    const phone = normalizeArPhone(phoneRaw)
    if (!phone) continue

    const name = normName(nameRaw)
    out.push(name ? { phone, name } : { phone })
  }

  return out
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
type SendRespErr = { ok: false; error: string; id?: string; status?: 'failed' }
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

type HealthResp = { ok: true; configured: boolean; baseUrl: string } | { ok: false; error: string }

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

type TabKey = 'test' | 'campaigns' | 'blocks' | 'metrics'
type CampaignsSubTab = 'create' | 'list'

type BlockCfg = { id: number; name: string; capacity: number }

/* =========================
   Parsers
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

function swalOk(title: string, text?: string) {
  return Swal.fire({
    icon: 'success',
    title,
    text: text || undefined,
    customClass: {
      popup: 'swal-popup',
      title: 'swal-title',
      htmlContainer: 'swal-text',
    },
    confirmButtonText: 'OK',
  })
}

function swalErr(title: string, text?: string) {
  return Swal.fire({
    icon: 'error',
    title,
    text: text || undefined,
    customClass: {
      popup: 'swal-popup',
      title: 'swal-title',
      htmlContainer: 'swal-text',
    },
    confirmButtonText: 'Cerrar',
  })
}

export function WhatsappScreen() {
  const apiBase = useMemo(() => getApiBase(), [])
  const { token } = useAuth()

  const [configured, setConfigured] = useState<boolean>(false)

  const [tab, setTab] = useState<TabKey>('campaigns')
  const [campaignsSub, setCampaignsSub] = useState<CampaignsSubTab>('create')
  const [refreshKey, setRefreshKey] = useState(0)
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
  const toNorm = useMemo(() => normalizeArPhone(to), [to])

  // ===== BLOCKS =====
  const [blocks, setBlocks] = useState<BlockCfg[]>([])
  const [blocksMsg, setBlocksMsg] = useState<string>('')

  // ===== CAMPAIGNS =====
  const [campName, setCampName] = useState('Campaña WhatsApp')
  const [campBody, setCampBody] = useState('')
  const [campTags, setCampTags] = useState('')
  const [campRequireAll, setCampRequireAll] = useState(false)
  const [campBlockId, setCampBlockId] = useState<string>('')
  const [campDelayMs, setCampDelayMs] = useState<number>(2500)

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null)
  const [campMsg, setCampMsg] = useState<string>('')

  // ===== locks =====
  const lockSend = useRef(false)
  const lockCreate = useRef(false)
  const lockAction = useRef(false)

  // Health/config
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

  // Blocks: los usamos en campañas + bloques
  useEffect(() => {
    if (tab !== 'campaigns' && tab !== 'blocks') return
    let alive = true

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
        setBlocks(parseBlocksResp(j))
        setBlocksMsg('')
        setLastUpdated(new Date().toLocaleTimeString())
      } catch (e: unknown) {
        if (!alive) return
        setBlocks([])
        setBlocksMsg(errToMessage(e))
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [apiBase, token, tab, refreshKey])

  // Status TEST
  useEffect(() => {
    if (tab !== 'test') return
    if (!internalId) return
    let alive = true

    const load = async () => {
      try {
        const r = await fetch(`${apiBase}/whapi/status/${internalId}`, { headers: authHeaders(token) })
        const j: unknown = await r.json().catch(() => null)
        const s = parseStatusResp(j)
        if (!alive) return
        if (!s.ok) return

        const st = s.data.status
        const err = s.data.error

        if (st === 'failed') {
          setUiStatus('failed')
          setOut(JSON.stringify({ ok: false, error: err ?? 'failed', status: st }, null, 2))
          setLastUpdated(new Date().toLocaleTimeString())
          return
        }
        if (st === 'read') {
          setUiStatus('read')
          setLastUpdated(new Date().toLocaleTimeString())
          return
        }

        if (st === 'delivered') setUiStatus('delivered')
        else if (st === 'sent') setUiStatus('sent')
        else setUiStatus('sending')

        setLastUpdated(new Date().toLocaleTimeString())
      } catch {
        // ignore
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [apiBase, internalId, token, tab, refreshKey])

  // List campaigns
  useEffect(() => {
    if (tab !== 'campaigns' && tab !== 'metrics') return
    let alive = true

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
      }
    }

    void load()
    return () => {
      alive = false
    }
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
    return () => {
      alive = false
    }
  }, [apiBase, selectedCampaignId, token, tab, refreshKey])

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
        await swalErr('Error', resp.ok ? 'Error' : resp.error)
        return
      }

      setUiStatus('sent')
      setInternalId(resp.id)
      setOut(JSON.stringify(resp, null, 2))
      setLastUpdated(new Date().toLocaleTimeString())
      await swalOk('Enviado', 'Mensaje de prueba enviado. Podés actualizar estado.')
    } catch (e: unknown) {
      setUiStatus('failed')
      setOut(JSON.stringify({ ok: false, error: errToMessage(e) }, null, 2))
      await swalErr('Error enviando', errToMessage(e))
    } finally {
      lockSend.current = false
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
        setRefreshKey((x) => x + 1)
        await swalOk('Campaña creada', 'Se creó y comenzó a ejecutarse.')
        return
      }

      setCampMsg(resp.ok ? 'OK' : resp.error)
      await swalErr('No se pudo crear', resp.ok ? 'Error' : resp.error)
    } catch (e: unknown) {
      setCampMsg(errToMessage(e))
      await swalErr('Error', errToMessage(e))
    } finally {
      lockCreate.current = false
    }
  }

  async function campaignAction(path: string): Promise<void> {
    if (!selectedCampaignId) return
    if (lockAction.current) return
    lockAction.current = true

    try {
      const confirm =
        path === 'cancel'
          ? await Swal.fire({
              icon: 'warning',
              title: '¿Cancelar campaña?',
              text: 'La campaña se detendrá. Podés reanudar luego (si el backend lo permite).',
              showCancelButton: true,
              confirmButtonText: 'Sí, cancelar',
              cancelButtonText: 'No',
              customClass: { popup: 'swal-popup', title: 'swal-title', htmlContainer: 'swal-text' },
            })
          : { isConfirmed: true }

      if (!confirm.isConfirmed) return

      setCampMsg('Procesando...')
      const r = await fetch(`${apiBase}/whapi/campaign/${selectedCampaignId}/${path}`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      const j: unknown = await r.json().catch(() => null)
      setCampMsg(isRecord(j) ? JSON.stringify(j, null, 2) : 'OK')
      setLastUpdated(new Date().toLocaleTimeString())
      setRefreshKey((x) => x + 1)

      await swalOk('Acción aplicada', `Se ejecutó: ${path}`)
    } catch (e: unknown) {
      setCampMsg(errToMessage(e))
      await swalErr('Error', errToMessage(e))
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
  const canCreate = Boolean(configured && campBody.trim())

  const effectiveDetail = selectedCampaignId ? campaignDetail : null
  const selected = effectiveDetail?.ok ? effectiveDetail.data : null
  const progress = selected ? percent(selected.doneCount, selected.total) : 0

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
          <span className="waPill waPill--muted">Últ. update: {lastUpdated}</span>
          {blocksMsg ? <span className="waPill waPill--warn">{blocksMsg}</span> : null}
        </div>

        <div className="waScreen__actions waScreen__actions--head">
          <button className="waBtn" type="button" onClick={() => bumpRefresh()}>
            Actualizar
          </button>
        </div>

        <div className="waTabs">
          <button className={`waTab ${tab === 'test' ? 'waTab--active' : ''}`} onClick={() => setTab('test')} type="button">
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
            className={`waTab ${tab === 'blocks' ? 'waTab--active' : ''}`}
            onClick={() => setTab('blocks')}
            type="button"
          >
            Bloques
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

      <div className="waScreen__body">
        {/* ===================== TEST ===================== */}
        {tab === 'test' && (
          <div className="waScreen__card waCardSplit">
            <div className="waCardSplit__left">
              <div className="waRow waRow--between">
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
                  placeholder="Ej: 11XXXXXXXX o 15XXXXXXXX (se arma 549...)"
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
                  rows={7}
                  placeholder="Escribí el texto del mensaje…"
                />
              </label>

              <div className="waScreen__actions">
                <button className="waScreen__primary" type="button" onClick={() => void sendTest()} disabled={!canSendTest}>
                  Enviar prueba
                </button>
              </div>
            </div>

            <div className="waCardSplit__right">
              <div className="waScreen__logTitle">Respuesta</div>
              <pre className="waScreen__pre">{out || '—'}</pre>
            </div>
          </div>
        )}

        {/* ===================== CAMPAIGNS ===================== */}
        {tab === 'campaigns' && (
          <div className="waScreen__card">
            <div className="waSubTabs">
              <button
                className={`waSubTab ${campaignsSub === 'create' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setCampaignsSub('create')}
              >
                Crear campañas
              </button>
              <button
                className={`waSubTab ${campaignsSub === 'list' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setCampaignsSub('list')}
              >
                Últimas campañas
              </button>
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

                  <label className="waScreen__field waGrid2__span2">
                    <span className="waScreen__label">Mensaje campaña</span>
                    <textarea
                      className="waScreen__textarea"
                      value={campBody}
                      onChange={(e) => setCampBody(e.target.value)}
                      rows={7}
                      placeholder="Texto que se enviará a todos..."
                    />
                  </label>
                </div>

                <div className="waScreen__actions">
                  <button className="waScreen__primary" type="button" disabled={!canCreate} onClick={() => void createCampaign()}>
                    Crear y ejecutar campaña
                  </button>
                  <div className="waScreen__note">
                    Filtra por bloque y/o tags. Requiere destinatarios con <b>phone</b>.
                  </div>
                </div>

                <div className="waMiniLog">
                  <div className="waMiniLog__title">Salida</div>
                  <pre className="waMiniLog__pre">{campMsg || '—'}</pre>
                </div>
              </>
            )}

            {campaignsSub === 'list' && (
              <div className="waCampaignList">
                <div className="waCampaignList__title">Últimas campañas</div>
                <div className="waTableWrap waTableWrap--max">
                  <table className="waTable">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Status</th>
                        <th>Total</th>
                        <th>Done</th>
                        <th>Failed</th>
                        <th>Delay</th>
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
                          <td>
                            <button
                              className="waLinkBtn"
                              type="button"
                              onClick={() => {
                                setSelectedCampaignId(c.id)
                                setTab('metrics')
                                bumpRefresh()
                              }}
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!campaigns.length && (
                        <tr>
                          <td colSpan={7} style={{ opacity: 0.7 }}>
                            — Sin campañas —
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="waScreen__note">
                  Tip: abrí una campaña con “Ver” y mirala en <b>Métricas</b>.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== BLOCKS (Destinatarios inyectado) ===================== */}
        {tab === 'blocks' && (
          <div className="waScreen__card">
            <WaRecipientsPanel />
          </div>
        )}

        {/* ===================== METRICS ===================== */}
        {tab === 'metrics' && (
          <div className="waScreen__card">
            {!selected ? (
              <div className="waScreen__note">Elegí una campaña en Campañas → “Últimas campañas” → “Ver”.</div>
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
                    <button className="waBtn" type="button" onClick={() => void campaignAction('resend-all')}>
                      Reenviar toda la campaña
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

                <div className="waTableWrap waTableWrap--max">
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
    </div>
  )
}