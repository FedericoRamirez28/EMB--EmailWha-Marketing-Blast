import React, { useEffect, useMemo, useState } from 'react'

type PrestadorEstado = 'activo' | 'pausado' | 'baja'

type Prestador = {
  id: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  zona: string
  estado: PrestadorEstado
  notas: string
  createdAt: string
}

type PrestadorForm = {
  nombre: string
  contacto: string
  telefono: string
  email: string
  zona: string
  estado: PrestadorEstado
  notas: string
}

const STORAGE_KEY = 'medic_ventas_prestadores_v1'

const EMPTY_FORM: PrestadorForm = {
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  zona: '',
  estado: 'activo',
  notas: '',
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function isEstado(value: string): value is PrestadorEstado {
  return value === 'activo' || value === 'pausado' || value === 'baja'
}

function parsePrestador(value: unknown): Prestador | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const nombre = getString(value, 'nombre')
  const rawEstado = getString(value, 'estado')

  if (!id || !nombre) return null

  return {
    id,
    nombre,
    contacto: getString(value, 'contacto'),
    telefono: getString(value, 'telefono'),
    email: getString(value, 'email'),
    zona: getString(value, 'zona'),
    estado: isEstado(rawEstado) ? rawEstado : 'activo',
    notas: getString(value, 'notas'),
    createdAt: getString(value, 'createdAt'),
  }
}

function readPrestadores(): Prestador[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parsePrestador(item))
      .filter((item): item is Prestador => item !== null)
  } catch {
    return []
  }
}

function savePrestadores(items: Prestador[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function PrestadorPanel() {
  const [items, setItems] = useState<Prestador[]>(() => readPrestadores())
  const [q, setQ] = useState('')
  const [form, setForm] = useState<PrestadorForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    savePrestadores(items)
  }, [items])

  const filtered = useMemo(() => {
    const needle = normalize(q)

    return items
      .filter((item) => {
        if (!needle) return true

        const hay = [
          item.nombre,
          item.contacto,
          item.telefono,
          item.email,
          item.zona,
          item.estado,
          item.notas,
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

        return normalize(a.nombre).localeCompare(normalize(b.nombre))
      })
  }, [items, q])

  const counts = useMemo(() => {
    return {
      activos: items.filter((x) => x.estado === 'activo').length,
      pausados: items.filter((x) => x.estado === 'pausado').length,
      baja: items.filter((x) => x.estado === 'baja').length,
      total: items.length,
    }
  }, [items])

  function resetForm(): void {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  function submit(): void {
    const nombre = form.nombre.trim()
    if (!nombre) return

    if (editingId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                nombre,
                contacto: form.contacto.trim(),
                telefono: form.telefono.trim(),
                email: form.email.trim(),
                zona: form.zona.trim(),
                estado: form.estado,
                notas: form.notas.trim(),
              }
            : item,
        ),
      )

      resetForm()
      return
    }

    const next: Prestador = {
      id: uid(),
      nombre,
      contacto: form.contacto.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim(),
      zona: form.zona.trim(),
      estado: form.estado,
      notas: form.notas.trim(),
      createdAt: new Date().toISOString(),
    }

    setItems((prev) => [next, ...prev])
    resetForm()
  }

  function edit(item: Prestador): void {
    setEditingId(item.id)
    setForm({
      nombre: item.nombre,
      contacto: item.contacto,
      telefono: item.telefono,
      email: item.email,
      zona: item.zona,
      estado: item.estado,
      notas: item.notas,
    })
  }

  function remove(id: string): void {
    const ok = window.confirm('¿Eliminar este prestador?')
    if (!ok) return

    setItems((prev) => prev.filter((item) => item.id !== id))

    if (editingId === id) {
      resetForm()
    }
  }

  return (
    <section className="prestadores">
      <div className="ventas-section-head">
        <div>
          <h2>Cartilla de prestadores</h2>
          <p>Buscá, cargá y organizá prestadores comerciales.</p>
        </div>

        <div className="ventas-pills">
          <span>Activos {counts.activos}</span>
          <span>Pausados {counts.pausados}</span>
          <span>Baja {counts.baja}</span>
          <span>Total {counts.total}</span>
        </div>
      </div>

      <div className="prestadores__tools">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por prestador, contacto, zona, teléfono o email..."
        />
      </div>

      <div className="prestadores__layout">
        <div className="prestadores__form">
          <h3>{editingId ? 'Editar prestador' : 'Agregar prestador'}</h3>

          <div className="ventas-form-grid">
            <label>
              Prestador
              <input
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Sanatorio / Clínica / Profesional"
              />
            </label>

            <label>
              Contacto
              <input
                value={form.contacto}
                onChange={(e) => setForm((p) => ({ ...p, contacto: e.target.value }))}
                placeholder="Nombre de contacto"
              />
            </label>

            <label>
              Teléfono
              <input
                value={form.telefono}
                onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                placeholder="Teléfono"
              />
            </label>

            <label>
              Email
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="correo@empresa.com"
              />
            </label>

            <label>
              Zona
              <input
                value={form.zona}
                onChange={(e) => setForm((p) => ({ ...p, zona: e.target.value }))}
                placeholder="Zona / Localidad"
              />
            </label>

            <label>
              Estado
              <select
                value={form.estado}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    estado: e.target.value as PrestadorEstado,
                  }))
                }
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="baja">Baja</option>
              </select>
            </label>

            <label className="ventas-form-grid__full">
              Notas
              <textarea
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones comerciales, condiciones, acuerdos, etc."
              />
            </label>
          </div>

          <div className="prestadores__formActions">
            {editingId ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn--primary"
              onClick={submit}
              disabled={!form.nombre.trim()}
            >
              {editingId ? 'Guardar cambios' : '+ Agregar prestador'}
            </button>
          </div>
        </div>

        <div className="prestadores__list">
          {filtered.length === 0 ? (
            <div className="ventas-empty">Todavía no hay prestadores cargados.</div>
          ) : (
            filtered.map((item) => (
              <article key={item.id} className="prestador-card">
                <div className="prestador-card__main">
                  <div>
                    <h3>{item.nombre}</h3>

                    <div className="prestador-card__meta">
                      <span>Contacto: {item.contacto || '-'}</span>
                      <span>Tel: {item.telefono || '-'}</span>
                      <span>Email: {item.email || '-'}</span>
                      <span>Zona: {item.zona || '-'}</span>
                    </div>
                  </div>

                  <span className={`prestador-card__status prestador-card__status--${item.estado}`}>
                    {item.estado}
                  </span>
                </div>

                {item.notas ? <p className="prestador-card__notes">{item.notas}</p> : null}

                <div className="prestador-card__actions">
                  <button type="button" onClick={() => edit(item)}>
                    Editar
                  </button>

                  <button type="button" onClick={() => remove(item.id)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  )
}