// src/components/ui/WaRecipientsPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import { useAuth } from '@/auth/useAuth'
import { waRecipientsApi, type WaRecipient, type BlockCfg } from '@/lib/waRecipientsApi'

const MAX_BLOCK_CAPACITY = 2000

function clampInt(n: number, min: number, max: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

function safeStr(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') return String(raw)
  return ''
}

function onlyDigits(raw: unknown): string {
  return safeStr(raw).replace(/[^\d]/g, '').trim()
}

function normName(raw: unknown): string {
  return safeStr(raw).replace(/\s+/g, ' ').trim()
}

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
    if (!phone || phone.length < 10) continue

    const name = normName(nameRaw)
    out.push(name ? { phone, name } : { phone })
  }

  return out
}

async function parseImportXlsx(file: File): Promise<Array<{ phone: string; name?: string }>> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames?.[0]
  if (!sheetName) return []

  const ws = wb.Sheets?.[sheetName]
  if (!ws) return []

  const rows: unknown[] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
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
    if (!phone || phone.length < 10) continue

    const name = normName(nameRaw)
    out.push(name ? { phone, name } : { phone })
  }

  return out
}

function displayBlockName(name: string): string {
  const s = String(name ?? '').trim()
  return s.startsWith('wa:') ? s.slice(3).trim() : s
}

const FALLBACK_BLOCKS: BlockCfg[] = [
  { id: 1, name: 'Bloque 1', capacity: 250 },
  { id: 0, name: 'Sin bloque', capacity: 999999 },
]

export default function WaRecipientsPanel() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [blocks, setBlocks] = useState<BlockCfg[]>(FALLBACK_BLOCKS)
  const [draftBlocks, setDraftBlocks] = useState<BlockCfg[]>([])
  const [blocksModalOpen, setBlocksModalOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set())

  const [list, setList] = useState<WaRecipient[]>([])
  const [activeBlockId, setActiveBlockId] = useState<number>(1)

  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [moveTo, setMoveTo] = useState<number | ''>('')

  // Import: destino y tags
  const [impTags, setImpTags] = useState('')
  const [insertBlockId, setInsertBlockId] = useState<number>(0) // 0 = bloque actual

  // “Más opciones de carga”
  const [moreOpen, setMoreOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  useEffect(() => {
    if (!token) return
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function refreshAll() {
    await Promise.all([refreshBlocks(), refreshRecipients()])
  }

  async function refreshBlocks() {
    if (!token) return
    try {
      const got = await waRecipientsApi.listBlocks(token)

      const byId = new Map<number, BlockCfg>()
      for (const b of got) {
        if (typeof b?.id !== 'number') continue
        byId.set(b.id, { ...b, name: displayBlockName(b.name) })
      }

      const sorted = [...byId.values()].sort((a, b) => a.id - b.id)
      const hasZero = sorted.some((b) => b.id === 0)
      const finalBlocks = hasZero ? sorted : [...sorted, { id: 0, name: 'Sin bloque', capacity: 999999 }]

      setBlocks(finalBlocks.length ? finalBlocks : FALLBACK_BLOCKS)

      setActiveBlockId((prev) => {
        const exists = finalBlocks.some((b) => b.id === prev)
        if (exists) return prev
        return finalBlocks.find((b) => b.id !== 0)?.id ?? 1
      })
    } catch (e: unknown) {
      setBlocks(FALLBACK_BLOCKS)
      await Swal.fire({ icon: 'error', title: 'Error cargando bloques', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function refreshRecipients() {
    if (!token) return
    try {
      const got = await waRecipientsApi.listWaRecipients(token)
      setList(got)
    } catch (e: unknown) {
      setList([])
      await Swal.fire({
        icon: 'error',
        title: 'Error cargando destinatarios',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function resolveInsertBlockId(): number {
    return insertBlockId !== 0 ? insertBlockId : activeBlockId
  }

  async function importRowsNow(fileName: string, rows: Array<{ phone: string; name?: string }>) {
    if (!token) return

    const blockId = resolveInsertBlockId()
    const blockName = blocks.find((b) => b.id === blockId)?.name?.trim() || ''
    const effectiveTags = impTags.trim() || blockName || undefined

    await Swal.fire({
      icon: 'info',
      title: 'Importando...',
      html: `Archivo: <b>${fileName}</b> · Registros: <b>${rows.length}</b>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    })

    try {
      const res = await waRecipientsApi.importPhones(token, { blockId, tags: effectiveTags, rows })
      await refreshRecipients()

      await Swal.fire({
        icon: 'success',
        title: 'Importación OK',
        text: `Insertados: ${res.inserted} · Actualizados: ${res.updated} · Saltados: ${res.skipped}`,
      })
    } catch (e: unknown) {
      await Swal.fire({
        icon: 'error',
        title: 'Error importando',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function handleFilePicked(file: File) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()

    try {
      let rows: Array<{ phone: string; name?: string }> = []
      if (ext === 'xls' || ext === 'xlsx') rows = await parseImportXlsx(file)
      else rows = parseImportTextSmart(await file.text())

      if (!rows.length) {
        await Swal.fire({ icon: 'warning', title: 'Sin datos', text: 'No se detectaron teléfonos válidos.' })
        return
      }

      // ✅ IMPORT AUTO (sin botón extra)
      await importRowsNow(file.name, rows)
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const fuse = useMemo(() => new Fuse(list, { keys: ['name', 'phone', 'tags'], threshold: 0.35 }), [list])
  const filteredAll = useMemo(() => (query ? fuse.search(query).map((r) => r.item) : list), [query, fuse, list])

  const tabItems = useMemo(
    () => filteredAll.filter((r) => (activeBlockId === 0 ? r.blockId === 0 : r.blockId === activeBlockId)),
    [filteredAll, activeBlockId],
  )

  const countByBlock = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of filteredAll) map.set(r.blockId, (map.get(r.blockId) ?? 0) + 1)
    if (!map.has(0)) map.set(0, 0)
    return map
  }, [filteredAll])

  const activeCfg = useMemo(() => {
    return blocks.find((b) => b.id === activeBlockId) ?? blocks[0] ?? FALLBACK_BLOCKS[0]
  }, [blocks, activeBlockId])

  const selectedInTab = useMemo(() => tabItems.filter((r) => selectedIds.has(r.id)), [tabItems, selectedIds])

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

  async function confirmPasteImport() {
    if (!token) return

    const blockId = resolveInsertBlockId()
    const rows = parseImportTextSmart(pasteText).filter((r) => (r.phone || '').length >= 10)
    if (!rows.length) {
      await Swal.fire({ icon: 'warning', title: 'Sin datos', text: 'No se detectaron teléfonos válidos.' })
      return
    }

    const blockName = blocks.find((b) => b.id === blockId)?.name?.trim() || ''
    const effectiveTags = impTags.trim() || blockName || undefined

    await Swal.fire({
      icon: 'info',
      title: 'Importando...',
      html: `Registros: <b>${rows.length}</b>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    })

    try {
      const res = await waRecipientsApi.importPhones(token, { blockId, tags: effectiveTags, rows })
      await refreshRecipients()
      setPasteText('')
      setMoreOpen(false)

      await Swal.fire({
        icon: 'success',
        title: 'Importación OK',
        text: `Insertados: ${res.inserted} · Actualizados: ${res.updated} · Saltados: ${res.skipped}`,
      })
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error importando', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function removeOne(id: number) {
    if (!token) return

    const r = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar destinatario',
      text: '¿Seguro que querés eliminar este destinatario?',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    })
    if (!r.isConfirmed) return

    try {
      await waRecipientsApi.removeWaRecipient(token, id)
      await refreshRecipients()
      setSelectedIds((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function removeSelectedInTab() {
    if (!token) return
    const ids = selectedInTab.map((r) => r.id)
    if (!ids.length) {
      await Swal.fire({ icon: 'info', title: 'Nada seleccionado', text: 'No hay seleccionados en este bloque.' })
      return
    }

    const r = await Swal.fire({
      icon: 'warning',
      title: `Eliminar ${ids.length}`,
      text: 'Esta acción no se puede deshacer.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    })
    if (!r.isConfirmed) return

    try {
      await waRecipientsApi.bulkRemoveWaRecipients(token, ids)
      await refreshRecipients()
      clearSelection()
      await Swal.fire({ icon: 'success', title: 'Eliminados', text: `Eliminados: ${ids.length}.` })
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function moveSelected() {
    if (!token) return
    const ids = selectedInTab.map((r) => r.id)
    if (!ids.length) {
      await Swal.fire({ icon: 'info', title: 'Nada seleccionado', text: 'No hay seleccionados en este bloque.' })
      return
    }

    const dest = typeof moveTo === 'number' ? moveTo : NaN
    if (!Number.isFinite(dest)) {
      await Swal.fire({ icon: 'warning', title: 'Bloque destino', text: 'Elegí un bloque destino.' })
      return
    }

    const destCfg = blocks.find((b) => b.id === dest)
    if (!destCfg) {
      await Swal.fire({ icon: 'error', title: 'Bloque inválido', text: 'Bloque destino inválido.' })
      return
    }

    if (dest !== 0) {
      const currentDestCount = countByBlock.get(dest) ?? 0
      const free = Math.max(0, (destCfg.capacity ?? 250) - currentDestCount)

      if (ids.length > free) {
        await Swal.fire({
          icon: 'warning',
          title: 'Sin espacio',
          text:
            `El bloque "${destCfg.name}" no tiene espacio suficiente.\n` +
            `Capacidad: ${destCfg.capacity}\nOcupado: ${currentDestCount}\nLibres: ${free}\nSeleccionados: ${ids.length}`,
        })
        return
      }
    }

    try {
      await waRecipientsApi.bulkMoveWaRecipients(token, ids, dest)
      await refreshRecipients()
      clearSelection()
      setMoveTo('')
      await Swal.fire({ icon: 'success', title: 'Movidos', text: `Movidos ${ids.length} a "${destCfg.name}".` })
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  function openBlocksModal() {
    const editable = blocks.filter((b) => b.id !== 0)
    setDraftBlocks(editable.length ? editable : [{ id: 1, name: 'Bloque 1', capacity: 250 }])
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
    setActiveBlockId((prev) => (prev === id ? 0 : prev))
    setInsertBlockId((prev) => (prev === id ? 0 : prev))
  }

  async function saveBlocksModal() {
    if (!token) return

    if (!draftBlocks.length) {
      await Swal.fire({ icon: 'warning', title: 'Bloques', text: 'Debe existir al menos 1 bloque.' })
      return
    }

    try {
      const idsToDelete = Array.from(pendingDeleteIds)
      for (const id of idsToDelete) await waRecipientsApi.removeBlock(token, id)

      for (const b of draftBlocks) {
        const name = safeStr(b.name).trim() || `Bloque ${b.id}`
        const capacity = clampInt(Number(b.capacity ?? 250), 1, MAX_BLOCK_CAPACITY)
        await waRecipientsApi.upsertBlock(token, { id: b.id, name, capacity })
      }

      setPendingDeleteIds(new Set())
      await refreshBlocks()
      closeBlocksModal()

      await Swal.fire({ icon: 'success', title: 'Guardado', text: 'Bloques actualizados.' })
    } catch (e: unknown) {
      await Swal.fire({ icon: 'error', title: 'Error guardando', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="card card--stretch wrp">
      <div className="panel-header">
        <h2 className="panel-title">Configuración de bloques y destinatarios</h2>

        <div className="wrp__actionsTop">
          <button className="btn btn--outline" onClick={openBlocksModal} type="button">
            Configurar bloques
          </button>
          <button className="btn btn--outline" onClick={openFilePicker} type="button">
            Importar XLS/TXT
          </button>
        </div>
      </div>

      <div className="wrp__insertRow">
        <span className="label wrp__insertLabel">Bloque destino</span>

        <select
          className="input wrp__insertSelect"
          value={String(insertBlockId)}
          onChange={(e) => setInsertBlockId(Number(e.target.value))}
        >
          <option value="0">— Bloque actual —</option>
          {blocks
            .filter((b) => b.id !== 0)
            .map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          <option value="0">Sin bloque (actual)</option>
        </select>

        <span className="wrp__hint">
          Tip: este tab reemplaza “Destinatarios”. Acá queda todo lo de WhatsApp.
          <br />
          Usará el bloque actual: <b>{activeCfg.name}</b>
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.csv,.list,.xls,.xlsx,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleFilePicked(f)
        }}
      />

      <div className="wrp__blocksChips">
        {blocks.map((b) => {
          const isActive = b.id === activeBlockId
          const count = countByBlock.get(b.id) ?? 0
          const capLabel = b.id === 0 ? `${count}` : `${count}/${b.capacity}`

          return (
            <button
              key={b.id}
              className={`btn ${isActive ? 'btn--primary' : 'btn--ghost'}`}
              type="button"
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

      {/* ✅ Sin botón “Importar números al bloque”: el XLS/TXT importa automáticamente */}

      <div className="wrp__importRow">
        <div className={`wrp__more ${moreOpen ? 'is-open' : ''}`}>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="wrp-more-panel"
          >
            Más opciones de carga <span className="wrp__chev">{moreOpen ? '▴' : '▾'}</span>
          </button>

          <div id="wrp-more-panel" className="wrp__morePanel" aria-hidden={!moreOpen}>
            <div className="wrp__moreGrid">
              <label className="wrp__field">
                <span className="label">Tags (opcional)</span>
                <input
                  className="input"
                  value={impTags}
                  onChange={(e) => setImpTags(e.target.value)}
                  placeholder="Vacío = nombre del bloque"
                />
              </label>

              <label className="wrp__field wrp__span2">
                <span className="label">Pegar lista (una fila por línea)</span>
                <textarea
                  className="input wrp__textarea"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Ej:\n1135006833,Rios Maximina\n1561346246\n11XXXXXXX`}
                />
                <div className="wrp__hint">
                  Formatos: <b>11XXXXXXXX</b>, <b>15XXXXXXXX</b>, <b>549...</b> · separadores coma/tab/;/|
                </div>
              </label>
            </div>

            <div className="wrp__moreActions">
              <button className="btn btn--outline" type="button" onClick={() => setPasteText('')}>
                Limpiar
              </button>
              <button className="btn btn--primary" type="button" onClick={() => void confirmPasteImport()} disabled={!pasteText.trim()}>
                Importar pegado
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="wrp__toolbar">
        <div className="wrp__search">
          <label className="label">Buscar</label>
          <input
            className="input"
            placeholder="Buscar por nombre, teléfono o tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="wrp__bulkBtns">
          <button className="btn btn--outline" onClick={toggleAllCurrentTab} type="button">
            {tabItems.length > 0 && tabItems.every((r) => selectedIds.has(r.id)) ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </button>

          <button className="btn btn--outline" onClick={clearSelection} type="button">
            Limpiar selección
          </button>

          <button className="btn btn--danger" onClick={() => void removeSelectedInTab()} disabled={!selectedInTab.length} type="button">
            Eliminar seleccionados
          </button>
        </div>

        <div className="wrp__moveBar">
          <div className="wrp__moveRow">
            <span className="badge">
              Seleccionados en este bloque: <b className="wrp__badgeNum">{selectedInTab.length}</b>
            </span>

            <select
              className="input wrp__moveSelect"
              value={moveTo === '' ? '' : String(moveTo)}
              onChange={(e) => setMoveTo(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Mover seleccionados a…</option>
              {blocks.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name} {b.id === 0 ? '' : `(cap ${b.capacity})`}
                </option>
              ))}
            </select>

            <button className="btn btn--primary" onClick={() => void moveSelected()} disabled={!selectedInTab.length || moveTo === ''} type="button">
              Mover
            </button>
          </div>

          <p className="wrp__hint">Tip: usá “Sin bloque” para encontrar los que quedaron afuera y moverlos al bloque correcto.</p>
        </div>
      </div>

      <div className="wrp__tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th className="wrp__colCheck">✔</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th className="wrp__colTags">Tags</th>
              <th className="wrp__colActions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tabItems.map((r) => (
              <tr key={r.id}>
                <td className="wrp__tdCheck">
                  <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>{r.name || '—'}</td>
                <td>{r.phone || '—'}</td>
                <td>
                  <span className="badge">{r.tags || '—'}</span>
                </td>
                <td className="wrp__tdActions">
                  <button className="btn btn--danger btn--sm" type="button" onClick={() => void removeOne(r.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}

            {!tabItems.length && (
              <tr>
                <td colSpan={5} className="wrp__empty">
                  {list.length ? 'No hay destinatarios en este bloque con el filtro actual.' : 'No hay destinatarios. Importá XLS/TXT.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="wrp__meta">
        Total: {list.length} · Filtrados: {filteredAll.length} · Seleccionados totales: {selectedIds.size}
      </p>

      {blocksModalOpen && (
        <div className="wrp__modalOverlay" role="dialog" aria-modal="true">
          <div className="wrp__modalCard card">
            <div className="wrp__modalHeader">
              <div>
                <h3 className="panel-title wrp__modalTitle">Configurar bloques (WhatsApp)</h3>
                <div className="wrp__hint">
                  Definí nombre y capacidad por bloque (1–{MAX_BLOCK_CAPACITY}). “Sin bloque” es automático (id 0).
                </div>
                {pendingDeleteIds.size > 0 && (
                  <div className="wrp__hint">
                    A eliminar al guardar: <b>{pendingDeleteIds.size}</b>
                  </div>
                )}
              </div>
              <button className="btn btn--outline" onClick={closeBlocksModal} type="button">
                Cerrar
              </button>
            </div>

            <div className="wrp__modalBody">
              <div className="wrp__modalGridHead">
                <span className="label">Nombre</span>
                <span className="label">Capacidad</span>
                <span className="label wrp__right">Acción</span>
              </div>

              <div className="wrp__modalList">
                {draftBlocks.map((b) => (
                  <div className="wrp__modalRow" key={b.id}>
                    <input
                      className="input"
                      value={b.name}
                      placeholder="Ej: Datos Teléfono"
                      onChange={(e) => updateBlockDraft(b.id, { name: e.target.value })}
                    />
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={MAX_BLOCK_CAPACITY}
                      value={b.capacity}
                      onChange={(e) => updateBlockDraft(b.id, { capacity: clampInt(Number(e.target.value), 1, MAX_BLOCK_CAPACITY) })}
                    />
                    <div className="wrp__rowRight">
                      <button className="btn btn--danger btn--sm" type="button" onClick={() => deleteBlockDraft(b.id)}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}

                {!draftBlocks.length && <div className="wrp__emptyBox">No hay bloques. Agregá al menos uno.</div>}
              </div>
            </div>

            <div className="wrp__modalFooter">
              <button className="btn btn--outline" onClick={addBlockDraft} type="button">
                Agregar bloque
              </button>
              <div className="wrp__spacer" />
              <button className="btn btn--outline" onClick={closeBlocksModal} type="button">
                Cancelar
              </button>
              <button className="btn btn--primary" onClick={() => void saveBlocksModal()} type="button">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}