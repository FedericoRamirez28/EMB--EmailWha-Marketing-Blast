// src/components/ui/RecipientsPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { useAuth } from '@/auth/useAuth'

import { recipientsApi, type Recipient, type BlockCfg } from '@/lib/recipientsApi'

const MAX_BLOCK_CAPACITY = 2000

function clampInt(n: number, min: number, max: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

/** ✅ Evita "[object Object]" y satisface no-base-to-string */
function normStr(v: unknown) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v).trim()
  return ''
}

/** Type guards/utilities para eliminar any/unsafe */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function getNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function getStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function normalizeEmail(raw: string) {
  let s = String(raw ?? '').trim()
  s = s.replace(/^\uFEFF/, '')
  s = s.replace(/^mailto:/i, '')

  const angled = s.match(/<([^>]+)>/)
  if (angled?.[1]) s = angled[1].trim()

  s = s.replace(/^"+|"+$/g, '').trim()
  s = s.replace(/[),.;:\]]+$/g, '').trim()
  s = s.replace(/^[([<]+/g, '').trim()
  s = s.toLowerCase().replace(/\s+/g, '')
  return s
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)
}

function splitTokens(raw: string) {
  return raw
    .split(/[\r\n,;\t]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

function parseEmailTokens(tokens: string[], blockId: number) {
  const out: Array<{ name?: string; email: string; tags?: string; blockId?: number }> = []

  for (const t of tokens) {
    const s0 = normStr(t)
    if (!s0) continue

    let m = s0.match(/^(.*?)<([^>]+)>$/)
    if (m) {
      const name = normStr(m[1]).replace(/^"|"$/g, '')
      const email = normalizeEmail(m[2])
      if (email && isValidEmail(email)) out.push({ name, email, blockId })
      continue
    }

    m = s0.match(/^(.+?)[,;]\s*([^,;]+@[^,;]+)$/)
    if (m) {
      const name = normStr(m[1])
      const email = normalizeEmail(m[2])
      if (email && isValidEmail(email)) out.push({ name, email, blockId })
      continue
    }

    const email = normalizeEmail(s0)
    if (email && isValidEmail(email)) out.push({ email, blockId })
  }

  return out
}

/** ✅ JSON.parse seguro (sin any) */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}


export default function RecipientsPanel({
  onSelectionChange,
}: {
  onSelectionChange: (sel: Recipient[]) => void
}) {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [list, setList] = useState<Recipient[]>([])
  const [blocks, setBlocks] = useState<BlockCfg[]>([])
  const [activeBlockId, setActiveBlockId] = useState<number>(1)

  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [tags, setTags] = useState('')

  const [blocksModalOpen, setBlocksModalOpen] = useState(false)
  const [draftBlocks, setDraftBlocks] = useState<BlockCfg[]>([])

  const [moveTo, setMoveTo] = useState<number | ''>('')

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set())
  const [insertBlockId, setInsertBlockId] = useState<number>(0) // 0 = "bloque actual"

  useEffect(() => {
    if (!token) return
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    onSelectionChange(list.filter((r) => selectedIds.has(r.id)))
  }, [selectedIds, list, onSelectionChange])

  async function refreshAll() {
    await Promise.all([refreshRecipients(), refreshBlocks()])
  }

  async function refreshRecipients() {
    if (!token) return
    const got = await recipientsApi.listRecipients(token)
    setList(got)
  }

  /** ✅ Parsea blocks sin any/unsafe */
  function parseBlocks(got: unknown): BlockCfg[] {
    const arr = Array.isArray(got) ? got : []

    const cleaned: BlockCfg[] = arr
      .map((b): BlockCfg | null => {
        if (!isRecord(b)) return null

        const id = getNum(b.id)
        if (id === null) return null

        const nameRaw = getStr(b.name)
        const capacityRaw = getNum(b.capacity)

        return {
          id,
          name: normStr(nameRaw) || (id === 0 ? 'Sin bloque' : `Bloque ${id}`),
          capacity: id === 0 ? 999999 : clampInt(capacityRaw ?? 250, 1, MAX_BLOCK_CAPACITY),
        }
      })
      .filter((x): x is BlockCfg => x !== null)
      .sort((a, b) => {
        if (a.id === 0) return 1
        if (b.id === 0) return -1
        return a.id - b.id
      })

    const hasZero = cleaned.some((b) => b.id === 0)
    const finalBlocks = hasZero ? cleaned : [...cleaned, { id: 0, name: 'Sin bloque', capacity: 999999 }]
    return finalBlocks
  }

  async function refreshBlocks() {
    if (!token) return
    const got = (await recipientsApi.listBlocks(token)) as unknown

    const finalBlocks = parseBlocks(got)
    setBlocks(finalBlocks)

    setActiveBlockId((prev) => {
      const exists = finalBlocks.some((b) => b.id === prev)
      if (exists) return prev
      const firstReal = finalBlocks.find((b) => b.id !== 0)?.id ?? 1
      return firstReal
    })

    const hasAnyReal = finalBlocks.some((b) => b.id !== 0)
    if (!hasAnyReal) setInsertBlockId(0)
  }

  const fuse = useMemo(() => new Fuse(list, { keys: ['name', 'email', 'tags'], threshold: 0.35 }), [list])

  const filteredAll = useMemo(() => {
    return query ? fuse.search(query).map((r) => r.item) : list
  }, [query, fuse, list])

  const tabItems = useMemo(() => {
    return filteredAll.filter((r) => (activeBlockId === 0 ? r.blockId === 0 : r.blockId === activeBlockId))
  }, [filteredAll, activeBlockId])

  const countByBlock = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of filteredAll) map.set(r.blockId, (map.get(r.blockId) ?? 0) + 1)
    if (!map.has(0)) map.set(0, 0)
    return map
  }, [filteredAll])

  const activeCfg = useMemo(() => {
    return blocks.find((b) => b.id === activeBlockId) ?? blocks[0] ?? { id: 1, name: 'Bloque 1', capacity: 250 }
  }, [blocks, activeBlockId])

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleAllCurrentTab() {
    const ids = tabItems.map((r) => r.id)
    const allChecked = ids.length > 0 && ids.every((id) => selectedIds.has(id))

    setSelectedIds((prev) => {
      const n = new Set(prev)
      ids.forEach((id) => {
        if (allChecked) n.delete(id)
        else n.add(id)
      })
      return n
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const selectedInTab = useMemo(() => tabItems.filter((r) => selectedIds.has(r.id)), [tabItems, selectedIds])

  function resolveInsertBlockId(): number {
    if (insertBlockId !== 0) return insertBlockId
    return activeBlockId
  }

  function canInsertInto(blockId: number): boolean {
    if (blockId === 0) return true
    return blocks.some((b) => b.id === blockId)
  }

  async function addRecipient() {
    if (!token) return
    const n = name.trim()
    const e = normalizeEmail(email)
    const t = tags.trim()

    if (!e || !isValidEmail(e)) {
      alert('Ingresá un email válido.')
      return
    }

    const blockId = resolveInsertBlockId()
    if (!canInsertInto(blockId)) {
      alert('Elegí un bloque válido para importar/agregar.')
      return
    }

    await recipientsApi.addRecipients(token, [{ name: n, email: e, tags: t, blockId }])
    await refreshRecipients()

    setName('')
    setEmail('')
    setTags('')
    setShowForm(false)
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  /** ✅ extrae tokens desde JSON unknown (sin any) */
  function tokensFromUnknown(parsed: unknown): string[] {
    const tokens: string[] = []

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') tokens.push(item)
        else if (isRecord(item)) {
          const e = getStr(item.email)
          const m = getStr(item.mail)
          if (e) tokens.push(e)
          else if (m) tokens.push(m)
        }
      }
      return tokens
    }

    if (isRecord(parsed)) {
      const maybeArr =
        (Array.isArray(parsed.emails) ? parsed.emails : null) ??
        (Array.isArray(parsed.mails) ? parsed.mails : null) ??
        (Array.isArray(parsed.recipients) ? parsed.recipients : null) ??
        (Array.isArray(parsed.data) ? parsed.data : null)

      if (maybeArr) {
        for (const item of maybeArr) {
          if (typeof item === 'string') tokens.push(item)
          else if (isRecord(item)) {
            const e = getStr(item.email)
            const m = getStr(item.mail)
            if (e) tokens.push(e)
            else if (m) tokens.push(m)
          }
        }
      }
    }

    return tokens
  }

  async function handleFilePicked(file: File) {
    if (!token) return

    const raw = await file.text()
    if (!raw || typeof raw !== 'string') {
      alert('No se pudo leer el archivo.')
      return
    }

    const blockId = resolveInsertBlockId()
    if (!canInsertInto(blockId)) {
      alert('Elegí un bloque válido para importar.')
      return
    }

    let tokens: string[] = []

    const rawTrim = raw.replace(/^\uFEFF/, '').trim()
    if (rawTrim.startsWith('[') || rawTrim.startsWith('{')) {
      const parsed = safeJsonParse(rawTrim)
      if (parsed !== null) {
        tokens = tokensFromUnknown(parsed)
      }
    }

    if (!tokens.length) tokens = splitTokens(raw)
    const rows = parseEmailTokens(tokens, blockId)

    if (!rows.length) {
      alert('No se encontraron emails válidos en el archivo.')
      return
    }

    await recipientsApi.addRecipients(token, rows)
    await refreshRecipients()

    alert(`Importados: ${rows.length} (al bloque "${blocks.find((b) => b.id === blockId)?.name ?? blockId}").`)
  }

  function openPaste() {
    setPasteText('')
    setPasteOpen(true)
  }
  function closePaste() {
    setPasteOpen(false)
  }

  async function confirmPaste() {
    if (!token) return
    const raw = pasteText || ''
    const blockId = resolveInsertBlockId()

    if (!canInsertInto(blockId)) {
      alert('Elegí un bloque válido para importar.')
      return
    }

    const tokens = splitTokens(raw)
    const rows = parseEmailTokens(tokens, blockId)

    if (!rows.length) {
      alert('No se encontraron emails válidos en el texto.')
      return
    }

    await recipientsApi.addRecipients(token, rows)
    await refreshRecipients()
    closePaste()
    alert(`Importados: ${rows.length}.`)
  }

  async function removeOne(id: number) {
    if (!token) return
    const ok = confirm('¿Eliminar destinatario?')
    if (!ok) return

    await recipientsApi.removeRecipient(token, id)
    await refreshRecipients()
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }

  async function moveSelected() {
    if (!token) return
    const ids = selectedInTab.map((r) => r.id)
    if (!ids.length) {
      alert('No hay destinatarios seleccionados en este bloque.')
      return
    }

    const dest = typeof moveTo === 'number' ? moveTo : NaN
    if (!Number.isFinite(dest)) {
      alert('Elegí un bloque destino.')
      return
    }

    const destCfg = blocks.find((b) => b.id === dest)
    if (!destCfg) {
      alert('Bloque destino inválido.')
      return
    }

    if (dest !== 0) {
      const currentDestCount = countByBlock.get(dest) ?? 0
      const free = Math.max(0, destCfg.capacity - currentDestCount)

      if (ids.length > free) {
        alert(
          `El bloque destino "${destCfg.name}" no tiene espacio suficiente.\n` +
            `Capacidad: ${destCfg.capacity}\n` +
            `Ocupado: ${currentDestCount}\n` +
            `Libres: ${free}\n` +
            `Seleccionados: ${ids.length}\n\n` +
            `Ajustá la capacidad del bloque o mové menos destinatarios.`,
        )
        return
      }
    }

    await recipientsApi.bulkMoveRecipients(token, ids, dest)
    await refreshRecipients()
    clearSelection()
    setMoveTo('')
    alert(`Movidos ${ids.length} destinatarios a "${destCfg.name}".`)
  }

  async function removeSelectedInTab() {
    if (!token) return
    const ids = selectedInTab.map((r) => r.id)
    if (!ids.length) {
      alert('No hay seleccionados en este bloque.')
      return
    }

    const ok = confirm(`¿Eliminar ${ids.length} destinatarios seleccionados? Esta acción no se puede deshacer.`)
    if (!ok) return

    await recipientsApi.bulkRemoveRecipients(token, ids)
    await refreshRecipients()
    clearSelection()
    alert(`Eliminados: ${ids.length}.`)
  }

  function openBlocksModal() {
    const editable = blocks.filter((b) => b.id !== 0)
    setDraftBlocks(editable.length ? editable : [])
    setPendingDeleteIds(new Set())
    setBlocksModalOpen(true)
  }

  function closeBlocksModal() {
    setBlocksModalOpen(false)
    setPendingDeleteIds(new Set())
  }

  function addBlockDraft() {
    const nextId = Math.max(1, ...draftBlocks.map((b) => b.id)) + 1
    setDraftBlocks((prev) => [...prev, { id: nextId, name: `Bloque ${nextId}`, capacity: 250 }])
  }

  function updateBlockDraft(id: number, patch: Partial<BlockCfg>) {
    setDraftBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function deleteBlockDraft(id: number) {
    if (Number.isInteger(id) && id > 0) {
      setPendingDeleteIds((prev) => {
        const n = new Set(prev)
        n.add(id)
        return n
      })
    }

    setDraftBlocks((prev) => prev.filter((b) => b.id !== id))

    setInsertBlockId((prev) => (prev === id ? 0 : prev))
    setActiveBlockId((prev) => (prev === id ? 0 : prev))
  }

  async function saveBlocksModal() {
    if (!token) return

    if (!draftBlocks.length) {
      alert('Debe existir al menos 1 bloque.')
      return
    }

    const idsToDelete = Array.from(pendingDeleteIds)
    for (const id of idsToDelete) {
      await recipientsApi.removeBlock(token, id)
    }

    for (const b of draftBlocks) {
      const name = normStr(b.name) || `Bloque ${b.id}`
      const capacity = clampInt(b.capacity ?? 250, 1, MAX_BLOCK_CAPACITY)
      await recipientsApi.upsertBlock(token, { id: b.id, name, capacity })
    }

    setPendingDeleteIds(new Set())
    await refreshBlocks()
    closeBlocksModal()
  }

  const insertOptions = useMemo(() => {
    const opts: Array<{ id: number; label: string }> = [{ id: 0, label: 'Bloque actual' }]
    for (const b of blocks) {
      if (b.id === 0) continue
      opts.push({ id: b.id, label: b.name })
    }
    opts.push({ id: -1, label: 'Sin bloque' })
    return opts
  }, [blocks])

  function uiInsertToRealId(uiId: number): number {
    if (uiId === -1) return 0
    return uiId
  }

  // ✅ wrappers para no-misused-promises (onClick espera void)
  const onClickImportFile = () => openFilePicker()
  const onClickOpenPaste = () => openPaste()
  const onClickToggleForm = () => setShowForm((v) => !v)
  const onClickOpenBlocks = () => openBlocksModal()

  const onClickAddRecipient = () => {
    void addRecipient()
  }
  const onClickMoveSelected = () => {
    void moveSelected()
  }
  const onClickRemoveSelected = () => {
    void removeSelectedInTab()
  }
  const onClickSaveBlocks = () => {
    void saveBlocksModal()
  }
  const onClickConfirmPaste = () => {
    void confirmPaste()
  }

  return (
    <div className="card">
      <div className="panel-header">
        <h2 className="panel-title">Destinatarios</h2>

        <div className="rp__actionsTop">
          <button className="btn" onClick={onClickImportFile}>
            Importar TXT/CSV/JSON
          </button>
          <button className="btn" onClick={onClickOpenPaste}>
            Pegar lista
          </button>
          <button className="btn" onClick={onClickToggleForm}>
            {showForm ? 'Cancelar' : 'Agregar destinatario'}
          </button>
          <button className="btn" onClick={onClickOpenBlocks}>
            Configurar bloques
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="label" style={{ margin: 0 }}>
          Importar / Agregar en:
        </span>

        <select
          className="input"
          style={{ width: 260 }}
          value={String(insertBlockId === 0 ? 0 : insertBlockId)}
          onChange={(e) => {
            const uiVal = Number(e.target.value)
            setInsertBlockId(uiInsertToRealId(uiVal))
          }}
        >
          {insertOptions.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.label}
            </option>
          ))}
        </select>

        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          {insertBlockId === 0 ? (
            <>
              Usa el bloque actual: <b>{activeCfg.name}</b>
            </>
          ) : (
            <>
              Seleccionado: <b>{blocks.find((b) => b.id === insertBlockId)?.name ?? insertBlockId}</b>
            </>
          )}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.csv,.json,.list,text/plain,application/json,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleFilePicked(f)
        }}
      />

      <div className="rp__blocksChips" style={{ marginBottom: 12 }}>
        {blocks.map((b) => {
          const isActive = b.id === activeBlockId
          const count = countByBlock.get(b.id) ?? 0
          const capLabel = b.id === 0 ? `${count}` : `${count}/${b.capacity}`

          return (
            <button
              key={b.id}
              className={`btn ${isActive ? 'btn-primary' : ''}`}
              onClick={() => {
                setActiveBlockId(b.id)
                setMoveTo('')
                clearSelection()
              }}
              title={b.id === 0 ? 'Destinatarios sin bloque' : `${b.name} · capacidad ${b.capacity}`}
            >
              {b.name} ({capLabel})
            </button>
          )
        })}
      </div>

      {showForm && (
        <div className="rp__addForm">
          <input
            className="input"
            placeholder="Nombre (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="rp__addFormRow">
            <input
              className="input"
              placeholder="Tags (coma separadas)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button className="btn btn-primary" onClick={onClickAddRecipient}>
              Guardar
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            Se agregará en:{' '}
            <b>
              {resolveInsertBlockId() === 0
                ? 'Sin bloque'
                : blocks.find((b) => b.id === resolveInsertBlockId())?.name ?? resolveInsertBlockId()}
            </b>
            .
          </p>
        </div>
      )}

      <div className="rp__toolbar" style={{ marginBottom: 10 }}>
        <div className="rp__search">
          <label className="label">Buscar</label>
          <input
            className="input"
            placeholder="Buscar por nombre, email o tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="rp__bulkBtns">
          <button className="btn" onClick={toggleAllCurrentTab}>
            {tabItems.length > 0 && tabItems.every((r) => selectedIds.has(r.id))
              ? 'Deseleccionar todo'
              : 'Seleccionar todo'}
          </button>

          <button className="btn" onClick={clearSelection}>
            Limpiar selección
          </button>

          <button
            className="btn btn-danger"
            onClick={onClickRemoveSelected}
            disabled={!selectedInTab.length}
            title="Eliminar todos los destinatarios seleccionados en este bloque"
          >
            Eliminar seleccionados
          </button>
        </div>

        <div className="rp__moveBar">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge">
              Seleccionados en este bloque: <b style={{ marginLeft: 6 }}>{selectedInTab.length}</b>
            </span>

            <select
              className="input"
              style={{ width: 260 }}
              value={moveTo === '' ? '' : String(moveTo)}
              onChange={(e) => {
                const v = e.target.value
                setMoveTo(v === '' ? '' : Number(v))
              }}
            >
              <option value="">Mover seleccionados a…</option>
              {blocks.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name} {b.id === 0 ? '' : `(cap ${b.capacity})`}
                </option>
              ))}
            </select>

            <button className="btn btn-primary" onClick={onClickMoveSelected} disabled={!selectedInTab.length || moveTo === ''}>
              Mover
            </button>
          </div>

          <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            Tip: usá “Sin bloque” para encontrar los que quedaron afuera y moverlos al bloque correcto.
          </p>
        </div>
      </div>

      <div className="rp__tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 46 }}>✔</th>
              <th>Nombre</th>
              <th>Email</th>
              <th style={{ width: 180 }}>Tags</th>
              <th style={{ width: 130, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tabItems.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>{r.name || '—'}</td>
                <td>{r.email}</td>
                <td>
                  <span className="badge">{r.tags || '—'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      void removeOne(r.id)
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}

            {!tabItems.length && (
              <tr>
                <td colSpan={5} style={{ padding: 14, color: 'rgba(255,255,255,0.7)' }}>
                  {list.length
                    ? 'No hay destinatarios en este bloque con el filtro actual.'
                    : 'No hay destinatarios. Usá “Importar” o “Agregar destinatario”.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="rp__meta">
        Total: {list.length} · Filtrados: {filteredAll.length} · Seleccionados totales:{' '}
        {selectedIds.size}
      </p>

      {blocksModalOpen && (
        <div className="rp__modalOverlay" role="dialog" aria-modal="true">
          <div className="rp__modalCard card">
            <div className="rp__modalHeader">
              <div>
                <h3 className="panel-title" style={{ marginBottom: 4 }}>
                  Configurar bloques
                </h3>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  Definí nombre y capacidad por bloque (1–{MAX_BLOCK_CAPACITY}). “Sin bloque” es automático (id 0).
                </div>
                {pendingDeleteIds.size > 0 && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
                    A eliminar al guardar: <b>{pendingDeleteIds.size}</b>
                  </div>
                )}
              </div>
              <button className="btn" onClick={closeBlocksModal}>
                Cerrar
              </button>
            </div>

            <div className="rp__modalBody">
              <div className="rp__modalGridHead">
                <span className="label">Nombre</span>
                <span className="label">Capacidad</span>
                <span className="label" style={{ textAlign: 'right' }}>
                  Acción
                </span>
              </div>

              <div className="rp__modalList">
                {draftBlocks.map((b) => (
                  <div className="rp__modalRow" key={b.id}>
                    <input
                      className="input"
                      value={b.name}
                      placeholder="Ej: Escuelas Morón"
                      onChange={(e) => updateBlockDraft(b.id, { name: e.target.value })}
                    />
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={MAX_BLOCK_CAPACITY}
                      value={b.capacity}
                      onChange={(e) =>
                        updateBlockDraft(b.id, { capacity: clampInt(Number(e.target.value), 1, MAX_BLOCK_CAPACITY) })
                      }
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn" type="button" onClick={() => deleteBlockDraft(b.id)}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}

                {!draftBlocks.length && (
                  <div style={{ padding: 10, color: 'rgba(255,255,255,0.7)' }}>No hay bloques. Agregá al menos uno.</div>
                )}
              </div>
            </div>

            <div className="rp__modalFooter">
              <button className="btn" onClick={addBlockDraft}>
                Agregar bloque
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={closeBlocksModal}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={onClickSaveBlocks}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="rp__modalOverlay" role="dialog" aria-modal="true">
          <div className="rp__modalCard card">
            <div className="rp__modalHeader">
              <div>
                <h3 className="panel-title" style={{ marginBottom: 4 }}>
                  Pegar lista
                </h3>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  Pegá emails separados por líneas, coma, punto y coma o tabs.
                </div>
              </div>
              <button className="btn" onClick={closePaste}>
                Cerrar
              </button>
            </div>

            <div className="rp__modalBody">
              <textarea
                className="input"
                style={{ minHeight: 220, width: '100%', resize: 'vertical' }}
                placeholder="Ej:
Juan Perez <juan@mail.com>
ana@mail.com
Nombre, correo@dom.com"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            </div>

            <div className="rp__modalFooter">
              <button className="btn" onClick={closePaste}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={onClickConfirmPaste}>
                Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
