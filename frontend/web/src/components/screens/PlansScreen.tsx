import React, { ChangeEvent, useMemo, useRef, useState } from 'react'

type PlanStatus = 'activo' | 'pausado' | 'baja'
type PlanKind = 'plan' | 'oferta'
type PlanPriority = 'alta' | 'media' | 'baja'
type PlanAudience = 'empresa' | 'particular' | 'familiar' | 'corporativo'
type PlanFileType = 'pdf' | 'image' | 'word' | 'other'

type PlanAttachment = {
  id: string
  fileName: string
  fileType: PlanFileType
  fileUrl: string
  createdAt: string
}

type PlanItem = {
  id: string
  nombre: string
  tipo: PlanKind
  estado: PlanStatus
  prioridad: PlanPriority
  publico: PlanAudience
  precio: string
  bonificacion: string
  vigenciaDesde: string
  vigenciaHasta: string
  descripcion: string
  serviciosIncluidos: string
  observaciones: string
  visibleVendedores: boolean
  consultas: number
  cierres: number
  attachments: PlanAttachment[]
  createdAt: string
}

type PlanForm = Omit<PlanItem, 'id' | 'attachments' | 'createdAt'>

const STORAGE_KEY = 'medic_ventas_planes_v1'

const EMPTY_FORM: PlanForm = {
  nombre: '',
  tipo: 'plan',
  estado: 'activo',
  prioridad: 'media',
  publico: 'empresa',
  precio: '',
  bonificacion: '',
  vigenciaDesde: '',
  vigenciaHasta: '',
  descripcion: '',
  serviciosIncluidos: '',
  observaciones: '',
  visibleVendedores: true,
  consultas: 0,
  cierres: 0,
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

function isPlanStatus(value: string): value is PlanStatus {
  return value === 'activo' || value === 'pausado' || value === 'baja'
}

function isPlanKind(value: string): value is PlanKind {
  return value === 'plan' || value === 'oferta'
}

function isPlanPriority(value: string): value is PlanPriority {
  return value === 'alta' || value === 'media' || value === 'baja'
}

function isPlanAudience(value: string): value is PlanAudience {
  return (
    value === 'empresa' ||
    value === 'particular' ||
    value === 'familiar' ||
    value === 'corporativo'
  )
}

function isPlanFileType(value: string): value is PlanFileType {
  return value === 'pdf' || value === 'image' || value === 'word' || value === 'other'
}

function getFileType(file: File): PlanFileType {
  const lowerName = file.name.toLowerCase()

  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'

  if (
    file.type.startsWith('image/') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png')
  ) {
    return 'image'
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return 'word'
  }

  return 'other'
}

function getFileLabel(fileType: PlanFileType): string {
  if (fileType === 'pdf') return 'PDF'
  if (fileType === 'word') return 'WORD'
  if (fileType === 'image') return 'IMG'
  return 'DOC'
}

function parseAttachment(value: unknown): PlanAttachment | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const fileName = getString(value, 'fileName')
  const rawType = getString(value, 'fileType')

  if (!id || !fileName) return null

  return {
    id,
    fileName,
    fileType: isPlanFileType(rawType) ? rawType : 'other',
    fileUrl: getString(value, 'fileUrl'),
    createdAt: getString(value, 'createdAt'),
  }
}

function parsePlan(value: unknown): PlanItem | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const nombre = getString(value, 'nombre')

  if (!id || !nombre) return null

  const rawAttachments = value.attachments
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments
        .map((item) => parseAttachment(item))
        .filter((item): item is PlanAttachment => item !== null)
    : []

  const rawTipo = getString(value, 'tipo')
  const rawEstado = getString(value, 'estado')
  const rawPrioridad = getString(value, 'prioridad')
  const rawPublico = getString(value, 'publico')

  return {
    id,
    nombre,
    tipo: isPlanKind(rawTipo) ? rawTipo : 'plan',
    estado: isPlanStatus(rawEstado) ? rawEstado : 'activo',
    prioridad: isPlanPriority(rawPrioridad) ? rawPrioridad : 'media',
    publico: isPlanAudience(rawPublico) ? rawPublico : 'empresa',
    precio: getString(value, 'precio'),
    bonificacion: getString(value, 'bonificacion'),
    vigenciaDesde: getString(value, 'vigenciaDesde'),
    vigenciaHasta: getString(value, 'vigenciaHasta'),
    descripcion: getString(value, 'descripcion'),
    serviciosIncluidos: getString(value, 'serviciosIncluidos'),
    observaciones: getString(value, 'observaciones'),
    visibleVendedores: getBoolean(value, 'visibleVendedores'),
    consultas: getNumber(value, 'consultas'),
    cierres: getNumber(value, 'cierres'),
    attachments,
    createdAt: getString(value, 'createdAt'),
  }
}

function readPlans(): PlanItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parsePlan(item))
      .filter((item): item is PlanItem => item !== null)
  } catch {
    return []
  }
}

function savePlans(items: PlanItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function formatDateAR(value: string): string {
  if (!value) return '-'

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function isOfferExpired(plan: PlanItem): boolean {
  if (plan.tipo !== 'oferta') return false
  if (!plan.vigenciaHasta) return false

  const end = new Date(`${plan.vigenciaHasta}T23:59:59`)
  return end.getTime() < Date.now()
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function PlansScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [plans, setPlans] = useState<PlanItem[]>(() => readPlans())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | PlanStatus | 'ofertas'>('todos')
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)

  const selectedPlan = useMemo(() => {
    return plans.find((item) => item.id === selectedId) ?? null
  }, [plans, selectedId])

  const filteredPlans = useMemo(() => {
    const needle = normalize(q)

    return plans
      .filter((plan) => {
        if (statusFilter === 'ofertas') return plan.tipo === 'oferta'
        if (statusFilter !== 'todos') return plan.estado === statusFilter
        return true
      })
      .filter((plan) => {
        if (!needle) return true

        const hay = [
          plan.nombre,
          plan.tipo,
          plan.estado,
          plan.prioridad,
          plan.publico,
          plan.precio,
          plan.bonificacion,
          plan.descripcion,
          plan.serviciosIncluidos,
          plan.observaciones,
        ]
          .map(normalize)
          .join(' ')

        return hay.includes(needle)
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) {
          if (a.estado === 'activo') return -1
          if (b.estado === 'activo') return 1
        }

        if (a.tipo !== b.tipo) {
          if (a.tipo === 'oferta') return -1
          if (b.tipo === 'oferta') return 1
        }

        return normalize(a.nombre).localeCompare(normalize(b.nombre))
      })
  }, [plans, q, statusFilter])

  const totals = useMemo(() => {
    return {
      total: plans.length,
      activos: plans.filter((item) => item.estado === 'activo').length,
      pausados: plans.filter((item) => item.estado === 'pausado').length,
      baja: plans.filter((item) => item.estado === 'baja').length,
      ofertas: plans.filter((item) => item.tipo === 'oferta').length,
      vencidas: plans.filter((item) => isOfferExpired(item)).length,
    }
  }, [plans])

  function persist(next: PlanItem[]): void {
    setPlans(next)
    savePlans(next)
  }

  function resetForm(): void {
    setForm(EMPTY_FORM)
    setSelectedId(null)
  }

  function submitPlan(): void {
    const nombre = form.nombre.trim()
    if (!nombre) return

    if (selectedPlan) {
      const next = plans.map((item) =>
        item.id === selectedPlan.id
          ? {
              ...item,
              ...form,
              nombre,
              precio: form.precio.trim(),
              bonificacion: form.bonificacion.trim(),
              descripcion: form.descripcion.trim(),
              serviciosIncluidos: form.serviciosIncluidos.trim(),
              observaciones: form.observaciones.trim(),
            }
          : item,
      )

      persist(next)
      return
    }

    const nextPlan: PlanItem = {
      id: uid(),
      ...form,
      nombre,
      precio: form.precio.trim(),
      bonificacion: form.bonificacion.trim(),
      descripcion: form.descripcion.trim(),
      serviciosIncluidos: form.serviciosIncluidos.trim(),
      observaciones: form.observaciones.trim(),
      attachments: [],
      createdAt: new Date().toISOString(),
    }

    persist([nextPlan, ...plans])
    setSelectedId(nextPlan.id)
  }

  function selectPlan(plan: PlanItem): void {
    setSelectedId(plan.id)
    setForm({
      nombre: plan.nombre,
      tipo: plan.tipo,
      estado: plan.estado,
      prioridad: plan.prioridad,
      publico: plan.publico,
      precio: plan.precio,
      bonificacion: plan.bonificacion,
      vigenciaDesde: plan.vigenciaDesde,
      vigenciaHasta: plan.vigenciaHasta,
      descripcion: plan.descripcion,
      serviciosIncluidos: plan.serviciosIncluidos,
      observaciones: plan.observaciones,
      visibleVendedores: plan.visibleVendedores,
      consultas: plan.consultas,
      cierres: plan.cierres,
    })
  }

  function deletePlan(id: string): void {
    const ok = window.confirm('¿Eliminar este plan?')
    if (!ok) return

    persist(plans.filter((item) => item.id !== id))

    if (selectedId === id) {
      resetForm()
    }
  }

  function openFilePicker(): void {
    if (!selectedPlan) return
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    if (!selectedPlan) return

    const file = event.target.files?.[0]
    if (!file) return

    const nextAttachment: PlanAttachment = {
      id: uid(),
      fileName: file.name,
      fileType: getFileType(file),
      fileUrl: URL.createObjectURL(file),
      createdAt: new Date().toISOString(),
    }

    const next = plans.map((plan) =>
      plan.id === selectedPlan.id
        ? {
            ...plan,
            attachments: [nextAttachment, ...plan.attachments],
          }
        : plan,
    )

    persist(next)
    event.target.value = ''
  }

  function removeAttachment(planId: string, attachmentId: string): void {
    const next = plans.map((plan) =>
      plan.id === planId
        ? {
            ...plan,
            attachments: plan.attachments.filter((item) => item.id !== attachmentId),
          }
        : plan,
    )

    persist(next)
  }

  function updateNumberField(key: 'consultas' | 'cierres', value: string): void {
    const parsed = Number(value)

    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    }))
  }

  return (
    <main className="plans-screen">
      <section className="plans-screen__hero">
        <div>
          <p className="plans-screen__eyebrow">Gestión comercial</p>
          <h1>Mis planes</h1>
          <p>
            Administrá planes activos, bajas, ofertas temporales, precios y material comercial.
          </p>
        </div>

        <div className="plans-screen__stats">
          <span>
            <strong>{totals.total}</strong>
            Total
          </span>
          <span>
            <strong>{totals.activos}</strong>
            Activos
          </span>
          <span>
            <strong>{totals.ofertas}</strong>
            Ofertas
          </span>
          <span>
            <strong>{totals.vencidas}</strong>
            Vencidas
          </span>
        </div>
      </section>

      <section className="plans-screen__layout">
        <section className="plans-panel">
          <div className="plans-panel__head">
            <div>
              <h2>Planes comerciales</h2>
              <p>Seleccioná un plan para editarlo o cargá uno nuevo desde el panel derecho.</p>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, precio, público, servicios u observaciones..."
            />
          </div>

          <div className="plans-filters">
            <button
              type="button"
              className={statusFilter === 'todos' ? 'is-active' : ''}
              onClick={() => setStatusFilter('todos')}
            >
              Todos {totals.total}
            </button>
            <button
              type="button"
              className={statusFilter === 'activo' ? 'is-active' : ''}
              onClick={() => setStatusFilter('activo')}
            >
              Activos {totals.activos}
            </button>
            <button
              type="button"
              className={statusFilter === 'ofertas' ? 'is-active' : ''}
              onClick={() => setStatusFilter('ofertas')}
            >
              Ofertas {totals.ofertas}
            </button>
            <button
              type="button"
              className={statusFilter === 'pausado' ? 'is-active' : ''}
              onClick={() => setStatusFilter('pausado')}
            >
              Pausados {totals.pausados}
            </button>
            <button
              type="button"
              className={statusFilter === 'baja' ? 'is-active' : ''}
              onClick={() => setStatusFilter('baja')}
            >
              Baja {totals.baja}
            </button>
          </div>

          <div className="plans-grid">
            {filteredPlans.length === 0 ? (
              <div className="plans-empty">
                <strong>Todavía no hay planes cargados.</strong>
                <span>Usá el panel derecho para crear el primer plan u oferta.</span>
              </div>
            ) : (
              filteredPlans.map((plan) => (
                <article
                  key={plan.id}
                  className={
                    'plan-card' +
                    (selectedPlan?.id === plan.id ? ' plan-card--active' : '') +
                    (isOfferExpired(plan) ? ' plan-card--expired' : '')
                  }
                  onClick={() => selectPlan(plan)}
                >
                  <div className="plan-card__top">
                    <div>
                      <h3>{plan.nombre}</h3>
                      <p>
                        {plan.publico} · {plan.tipo === 'oferta' ? 'Oferta' : 'Plan'}
                      </p>
                    </div>

                    <span className={`plan-status plan-status--${plan.estado}`}>
                      {plan.estado}
                    </span>
                  </div>

                  <div className="plan-card__price">
                    <strong>{plan.precio || 'Sin precio'}</strong>
                    {plan.bonificacion ? <span>{plan.bonificacion}</span> : null}
                  </div>

                  <div className="plan-card__tags">
                    <span className={`plan-priority plan-priority--${plan.prioridad}`}>
                      {plan.prioridad}
                    </span>

                    {plan.tipo === 'oferta' ? (
                      <span className="plan-kind">
                        Hasta {formatDateAR(plan.vigenciaHasta)}
                      </span>
                    ) : null}

                    <span className={plan.visibleVendedores ? 'plan-visible' : 'plan-hidden'}>
                      {plan.visibleVendedores ? 'Visible' : 'Oculto'}
                    </span>
                  </div>

                  {plan.descripcion ? <p className="plan-card__desc">{plan.descripcion}</p> : null}

                  <div className="plan-card__meta">
                    <span>Consultas: {plan.consultas}</span>
                    <span>Cierres: {plan.cierres}</span>
                    <span>Adjuntos: {plan.attachments.length}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="plans-sidebar">
          <div className="plans-sidebar__head">
            <div>
              <h2>{selectedPlan ? 'Editar plan' : 'Nuevo plan'}</h2>
              <p>
                {selectedPlan
                  ? 'Modificá la información comercial.'
                  : 'Cargá un plan activo, baja u oferta.'}
              </p>
            </div>

            {selectedPlan ? (
              <button type="button" onClick={resetForm}>
                + Nuevo
              </button>
            ) : null}
          </div>

          <div className="plans-form">
            <label className="plans-form__full">
              Nombre del plan
              <input
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Plan Empresa Oro"
              />
            </label>

            <label>
              Tipo
              <select
                value={form.tipo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tipo: e.target.value as PlanKind }))
                }
              >
                <option value="plan">Plan</option>
                <option value="oferta">Oferta limitada</option>
              </select>
            </label>

            <label>
              Estado
              <select
                value={form.estado}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, estado: e.target.value as PlanStatus }))
                }
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="baja">Baja</option>
              </select>
            </label>

            <label>
              Público
              <select
                value={form.publico}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, publico: e.target.value as PlanAudience }))
                }
              >
                <option value="empresa">Empresa</option>
                <option value="particular">Particular</option>
                <option value="familiar">Familiar</option>
                <option value="corporativo">Corporativo</option>
              </select>
            </label>

            <label>
              Prioridad
              <select
                value={form.prioridad}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    prioridad: e.target.value as PlanPriority,
                  }))
                }
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </label>

            <label>
              Precio
              <input
                value={form.precio}
                onChange={(e) => setForm((prev) => ({ ...prev, precio: e.target.value }))}
                placeholder="$ 00.000"
              />
            </label>

            <label>
              Bonificación
              <input
                value={form.bonificacion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bonificacion: e.target.value }))
                }
                placeholder="Ej: 20% off por 3 meses"
              />
            </label>

            <label>
              Vigencia desde
              <input
                type="date"
                value={form.vigenciaDesde}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vigenciaDesde: e.target.value }))
                }
              />
            </label>

            <label>
              Vigencia hasta
              <input
                type="date"
                value={form.vigenciaHasta}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vigenciaHasta: e.target.value }))
                }
              />
            </label>

            <label>
              Consultas
              <input
                type="number"
                min={0}
                value={form.consultas}
                onChange={(e) => updateNumberField('consultas', e.target.value)}
              />
            </label>

            <label>
              Cierres
              <input
                type="number"
                min={0}
                value={form.cierres}
                onChange={(e) => updateNumberField('cierres', e.target.value)}
              />
            </label>

            <label className="plans-form__check">
              <input
                type="checkbox"
                checked={form.visibleVendedores}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    visibleVendedores: e.target.checked,
                  }))
                }
              />
              Visible para vendedores
            </label>

            <label className="plans-form__full">
              Descripción comercial
              <textarea
                value={form.descripcion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                placeholder="Descripción corta del plan para uso comercial..."
              />
            </label>

            <label className="plans-form__full">
              Servicios incluidos
              <textarea
                value={form.serviciosIncluidos}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, serviciosIncluidos: e.target.value }))
                }
                placeholder="Prestaciones, cobertura, beneficios, límites, condiciones..."
              />
            </label>

            <label className="plans-form__full">
              Observaciones internas
              <textarea
                value={form.observaciones}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, observaciones: e.target.value }))
                }
                placeholder="Notas internas para gerencia comercial..."
              />
            </label>

            <button
              type="button"
              className="plans-form__submit"
              onClick={submitPlan}
              disabled={!form.nombre.trim()}
            >
              {selectedPlan ? 'Guardar cambios' : '+ Crear plan'}
            </button>

            {selectedPlan ? (
              <button
                type="button"
                className="plans-form__danger"
                onClick={() => deletePlan(selectedPlan.id)}
              >
                Eliminar plan
              </button>
            ) : null}
          </div>

          <div className="plans-files">
            <div className="plans-files__head">
              <div>
                <h3>Material comercial</h3>
                <p>Adjuntá PDF, imagen o Word del plan.</p>
              </div>

              <button type="button" onClick={openFilePicker} disabled={!selectedPlan}>
                + Adjuntar
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              hidden
            />

            {!selectedPlan ? (
              <div className="plans-empty plans-empty--small">
                Guardá o seleccioná un plan para adjuntar archivos.
              </div>
            ) : selectedPlan.attachments.length === 0 ? (
              <div className="plans-empty plans-empty--small">Todavía no hay archivos.</div>
            ) : (
              <div className="plans-files__list">
                {selectedPlan.attachments.map((file) => (
                  <article key={file.id} className="plan-file-card">
                    <span className={`plan-file-card__icon plan-file-card__icon--${file.fileType}`}>
                      {getFileLabel(file.fileType)}
                    </span>

                    <div>
                      <strong>{file.fileName}</strong>
                      <a href={file.fileUrl} target="_blank" rel="noreferrer">
                        Abrir archivo
                      </a>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeAttachment(selectedPlan.id, file.id)}
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}