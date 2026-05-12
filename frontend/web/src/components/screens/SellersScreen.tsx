import React, { ChangeEvent, useMemo, useRef, useState } from 'react'

type SellerStatus = 'activo' | 'pausado'
type SellerPriority = 'alta' | 'media' | 'baja'

type HomeSeller = {
  id: string
  nombre: string
  telefono: string
  email: string
  zona: string
  objetivo: string
  activo: boolean
  createdAt: string
}

type SellerManagerData = {
  sellerId: string
  zonas: string
  observaciones: string
  objetivoMensual: string
  prioridad: SellerPriority
  llamados: number
  interesados: number
  contratosEnviados: number
  padronManual: string
  attachments: SellerAttachment[]
}

type SellerAttachment = {
  id: string
  fileName: string
  fileType: string
  fileUrl: string
  createdAt: string
}

type SellerView = HomeSeller & {
  status: SellerStatus
  manager: SellerManagerData
}

const HOME_SELLERS_KEY = 'medic_ventas_vendedores_v1'
const MANAGER_DATA_KEY = 'medic_ventas_vendedores_manager_v1'

const EMPTY_MANAGER_DATA: Omit<SellerManagerData, 'sellerId'> = {
  zonas: '',
  observaciones: '',
  objetivoMensual: '',
  prioridad: 'media',
  llamados: 0,
  interesados: 0,
  contratosEnviados: 0,
  padronManual: '',
  attachments: [],
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function getNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function getBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return typeof value === 'boolean' ? value : true
}

function isPriority(value: string): value is SellerPriority {
  return value === 'alta' || value === 'media' || value === 'baja'
}

function parseHomeSeller(value: unknown): HomeSeller | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const nombre = getString(value, 'nombre')

  if (!id || !nombre) return null

  return {
    id,
    nombre,
    telefono: getString(value, 'telefono'),
    email: getString(value, 'email'),
    zona: getString(value, 'zona'),
    objetivo: getString(value, 'objetivo'),
    activo: getBoolean(value, 'activo'),
    createdAt: getString(value, 'createdAt'),
  }
}

function parseAttachment(value: unknown): SellerAttachment | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const fileName = getString(value, 'fileName')

  if (!id || !fileName) return null

  return {
    id,
    fileName,
    fileType: getString(value, 'fileType'),
    fileUrl: getString(value, 'fileUrl'),
    createdAt: getString(value, 'createdAt'),
  }
}

function parseManagerData(value: unknown): SellerManagerData | null {
  if (!isRecord(value)) return null

  const sellerId = getString(value, 'sellerId')
  if (!sellerId) return null

  const rawPriority = getString(value, 'prioridad')
  const rawAttachments = value.attachments
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments
        .map((item) => parseAttachment(item))
        .filter((item): item is SellerAttachment => item !== null)
    : []

  return {
    sellerId,
    zonas: getString(value, 'zonas'),
    observaciones: getString(value, 'observaciones'),
    objetivoMensual: getString(value, 'objetivoMensual'),
    prioridad: isPriority(rawPriority) ? rawPriority : 'media',
    llamados: getNumber(value, 'llamados'),
    interesados: getNumber(value, 'interesados'),
    contratosEnviados: getNumber(value, 'contratosEnviados'),
    padronManual: getString(value, 'padronManual'),
    attachments,
  }
}

function readHomeSellers(): HomeSeller[] {
  try {
    const raw = localStorage.getItem(HOME_SELLERS_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parseHomeSeller(item))
      .filter((item): item is HomeSeller => item !== null)
  } catch {
    return []
  }
}

function readManagerData(): SellerManagerData[] {
  try {
    const raw = localStorage.getItem(MANAGER_DATA_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parseManagerData(item))
      .filter((item): item is SellerManagerData => item !== null)
  } catch {
    return []
  }
}

function saveManagerData(items: SellerManagerData[]): void {
  localStorage.setItem(MANAGER_DATA_KEY, JSON.stringify(items))
}

function makeDefaultManagerData(sellerId: string): SellerManagerData {
  return {
    sellerId,
    ...EMPTY_MANAGER_DATA,
  }
}

function getPadronCount(value: string): number {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean).length
}

function formatDateAR(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function SellersScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [homeSellers] = useState<HomeSeller[]>(() => readHomeSellers())
  const [managerData, setManagerData] = useState<SellerManagerData[]>(() => readManagerData())
  const [selectedId, setSelectedId] = useState<string | null>(() => homeSellers[0]?.id ?? null)
  const [q, setQ] = useState('')

  const sellers = useMemo<SellerView[]>(() => {
    return homeSellers.map((seller) => {
      const manager = managerData.find((item) => item.sellerId === seller.id)

      return {
        ...seller,
        status: seller.activo ? 'activo' : 'pausado',
        manager: manager ?? makeDefaultManagerData(seller.id),
      }
    })
  }, [homeSellers, managerData])

  const selectedSeller = useMemo(() => {
    return sellers.find((seller) => seller.id === selectedId) ?? null
  }, [sellers, selectedId])

  const filteredSellers = useMemo(() => {
    const needle = q.trim().toLowerCase()

    if (!needle) return sellers

    return sellers.filter((seller) => {
      const hay = [
        seller.nombre,
        seller.telefono,
        seller.email,
        seller.zona,
        seller.objetivo,
        seller.manager.zonas,
        seller.manager.observaciones,
        seller.manager.objetivoMensual,
        seller.manager.prioridad,
      ]
        .join(' ')
        .toLowerCase()

      return hay.includes(needle)
    })
  }, [q, sellers])

  const totals = useMemo(() => {
    return sellers.reduce(
      (acc, seller) => {
        acc.llamados += seller.manager.llamados
        acc.interesados += seller.manager.interesados
        acc.contratos += seller.manager.contratosEnviados
        acc.padrones += getPadronCount(seller.manager.padronManual)
        return acc
      },
      {
        llamados: 0,
        interesados: 0,
        contratos: 0,
        padrones: 0,
      },
    )
  }, [sellers])

  function upsertManagerData(sellerId: string, patch: Partial<SellerManagerData>): void {
    setManagerData((prev) => {
      const exists = prev.some((item) => item.sellerId === sellerId)

      const next = exists
        ? prev.map((item) => (item.sellerId === sellerId ? { ...item, ...patch } : item))
        : [{ ...makeDefaultManagerData(sellerId), ...patch }, ...prev]

      saveManagerData(next)
      return next
    })
  }

  function updateNumberField(
    sellerId: string,
    key: 'llamados' | 'interesados' | 'contratosEnviados',
    value: string,
  ): void {
    const parsed = Number(value)
    upsertManagerData(sellerId, {
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    })
  }

  function openFilePicker(): void {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    if (!selectedSeller) return

    const file = event.target.files?.[0]
    if (!file) return

    const nextAttachment: SellerAttachment = {
      id: uid(),
      fileName: file.name,
      fileType: file.type || 'archivo',
      fileUrl: URL.createObjectURL(file),
      createdAt: new Date().toISOString(),
    }

    upsertManagerData(selectedSeller.id, {
      attachments: [nextAttachment, ...selectedSeller.manager.attachments],
    })

    event.target.value = ''
  }

  function removeAttachment(sellerId: string, attachmentId: string): void {
    const seller = sellers.find((item) => item.id === sellerId)
    if (!seller) return

    upsertManagerData(sellerId, {
      attachments: seller.manager.attachments.filter((item) => item.id !== attachmentId),
    })
  }

  return (
    <main className="sellers-screen">
      <section className="sellers-screen__hero">
        <div>
          <p className="sellers-screen__eyebrow">Gerencia comercial</p>
          <h1>Mis vendedores</h1>
          <p>
            Asigná padrones de teléfonos, zonas, objetivos y observaciones internas para cada vendedor.
          </p>
        </div>

        <div className="sellers-screen__stats">
          <span>
            <strong>{sellers.length}</strong>
            Vendedores
          </span>

          <span>
            <strong>{totals.padrones}</strong>
            Teléfonos
          </span>

          <span>
            <strong>{totals.llamados}</strong>
            Llamados
          </span>

          <span>
            <strong>{totals.contratos}</strong>
            Contratos
          </span>
        </div>
      </section>

      <section className="sellers-screen__layout">
        <aside className="sellers-list-panel">
          <div className="sellers-list-panel__head">
            <div>
              <h2>Equipo comercial</h2>
              <p>Datos tomados desde la Home.</p>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar vendedor, zona u objetivo..."
            />
          </div>

          <div className="sellers-list">
            {filteredSellers.length === 0 ? (
              <div className="sellers-empty">
                Todavía no hay vendedores cargados. Primero agregalos desde la Home.
              </div>
            ) : (
              filteredSellers.map((seller) => (
                <button
                  key={seller.id}
                  type="button"
                  className={
                    'seller-card' + (selectedSeller?.id === seller.id ? ' seller-card--active' : '')
                  }
                  onClick={() => setSelectedId(seller.id)}
                >
                  <span className="seller-card__avatar">
                    {seller.nombre.slice(0, 1).toUpperCase()}
                  </span>

                  <span className="seller-card__body">
                    <span className="seller-card__top">
                      <strong>{seller.nombre}</strong>
                      <em className={`seller-priority seller-priority--${seller.manager.prioridad}`}>
                        {seller.manager.prioridad}
                      </em>
                    </span>

                    <span>{seller.zona || seller.manager.zonas || 'Sin zona asignada'}</span>

                    <small>
                      {getPadronCount(seller.manager.padronManual)} teléfonos ·{' '}
                      {seller.manager.llamados} llamados
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="seller-detail-panel">
          {!selectedSeller ? (
            <div className="sellers-empty sellers-empty--large">
              Seleccioná un vendedor para administrar sus padrones, zonas y objetivos.
            </div>
          ) : (
            <>
              <div className="seller-detail-panel__head">
                <div className="seller-detail-panel__identity">
                  <span>{selectedSeller.nombre.slice(0, 1).toUpperCase()}</span>

                  <div>
                    <p>Vendedor seleccionado</p>
                    <h2>{selectedSeller.nombre}</h2>
                    <small>
                      {selectedSeller.email || '-'} · {selectedSeller.telefono || '-'}
                    </small>
                  </div>
                </div>

                <div className="seller-detail-panel__badges">
                  <span className={`seller-status seller-status--${selectedSeller.status}`}>
                    {selectedSeller.status}
                  </span>
                  <span className={`seller-priority seller-priority--${selectedSeller.manager.prioridad}`}>
                    Prioridad {selectedSeller.manager.prioridad}
                  </span>
                </div>
              </div>

              <div className="seller-metrics">
                <label>
                  Llamados realizados
                  <input
                    type="number"
                    min={0}
                    value={selectedSeller.manager.llamados}
                    onChange={(e) =>
                      updateNumberField(selectedSeller.id, 'llamados', e.target.value)
                    }
                  />
                </label>

                <label>
                  Interesados
                  <input
                    type="number"
                    min={0}
                    value={selectedSeller.manager.interesados}
                    onChange={(e) =>
                      updateNumberField(selectedSeller.id, 'interesados', e.target.value)
                    }
                  />
                </label>

                <label>
                  Contratos enviados
                  <input
                    type="number"
                    min={0}
                    value={selectedSeller.manager.contratosEnviados}
                    onChange={(e) =>
                      updateNumberField(selectedSeller.id, 'contratosEnviados', e.target.value)
                    }
                  />
                </label>

                <label>
                  Prioridad comercial
                  <select
                    value={selectedSeller.manager.prioridad}
                    onChange={(e) =>
                      upsertManagerData(selectedSeller.id, {
                        prioridad: e.target.value as SellerPriority,
                      })
                    }
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </label>
              </div>

              <div className="seller-editor-grid">
                <label>
                  Zonas a cubrir
                  <textarea
                    value={selectedSeller.manager.zonas}
                    onChange={(e) =>
                      upsertManagerData(selectedSeller.id, {
                        zonas: e.target.value,
                      })
                    }
                    placeholder="Ej: San Justo, Ramos Mejía, Morón, CABA..."
                  />
                </label>

                <label>
                  Objetivo mensual
                  <textarea
                    value={selectedSeller.manager.objetivoMensual}
                    onChange={(e) =>
                      upsertManagerData(selectedSeller.id, {
                        objetivoMensual: e.target.value,
                      })
                    }
                    placeholder="Ej: 80 llamados por semana, 15 interesados, 5 contratos..."
                  />
                </label>

                <label className="seller-editor-grid__full">
                  Padrón manual de teléfonos
                  <textarea
                    value={selectedSeller.manager.padronManual}
                    onChange={(e) =>
                      upsertManagerData(selectedSeller.id, {
                        padronManual: e.target.value,
                      })
                    }
                    placeholder="Pegá teléfonos separados por coma, punto y coma o salto de línea..."
                  />
                  <small>
                    Detectados: {getPadronCount(selectedSeller.manager.padronManual)} teléfonos.
                  </small>
                </label>

                <label className="seller-editor-grid__full">
                  Observaciones internas
                  <textarea
                    value={selectedSeller.manager.observaciones}
                    onChange={(e) =>
                      upsertManagerData(selectedSeller.id, {
                        observaciones: e.target.value,
                      })
                    }
                    placeholder="Notas para gerencia: seguimiento, rendimiento, cartera, acuerdos, etc."
                  />
                </label>
              </div>

              <div className="seller-files">
                <div className="seller-files__head">
                  <div>
                    <h3>Padrones y archivos asignados</h3>
                    <p>Podés adjuntar Excel, imágenes, PDF, TXT o CSV.</p>
                  </div>

                  <button type="button" onClick={openFilePicker}>
                    + Cargar padrón
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt,.pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf,text/csv,text/plain"
                    onChange={handleFileChange}
                    hidden
                  />
                </div>

                <div className="seller-files__list">
                  {selectedSeller.manager.attachments.length === 0 ? (
                    <div className="sellers-empty">Todavía no hay archivos cargados.</div>
                  ) : (
                    selectedSeller.manager.attachments.map((file) => (
                      <article key={file.id} className="seller-file-card">
                        <div>
                          <strong>{file.fileName}</strong>
                          <span>{formatDateAR(file.createdAt)}</span>
                        </div>

                        <div className="seller-file-card__actions">
                          <a href={file.fileUrl} target="_blank" rel="noreferrer">
                            Abrir
                          </a>

                          <button
                            type="button"
                            onClick={() => removeAttachment(selectedSeller.id, file.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  )
}