import React, { useEffect, useMemo, useState } from 'react'

type Vendedor = {
  id: string
  nombre: string
  telefono: string
  email: string
  zona: string
  objetivo: string
  activo: boolean
  createdAt: string
}

type VendedorForm = {
  nombre: string
  telefono: string
  email: string
  zona: string
  objetivo: string
  activo: boolean
}

const STORAGE_KEY = 'medic_ventas_vendedores_v1'

const EMPTY_FORM: VendedorForm = {
  nombre: '',
  telefono: '',
  email: '',
  zona: '',
  objetivo: '',
  activo: true,
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

function getBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return typeof value === 'boolean' ? value : true
}

function parseVendedor(value: unknown): Vendedor | null {
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

function readItems(): Vendedor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parseVendedor(item))
      .filter((item): item is Vendedor => item !== null)
  } catch {
    return []
  }
}

function saveItems(items: Vendedor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function VendedorPanel() {
  const [items, setItems] = useState<Vendedor[]>(() => readItems())
  const [form, setForm] = useState<VendedorForm>(EMPTY_FORM)

  useEffect(() => {
    saveItems(items)
  }, [items])

  const activos = useMemo(() => {
    return items.filter((item) => item.activo).length
  }, [items])

  function submit(): void {
    const nombre = form.nombre.trim()
    if (!nombre) return

    const next: Vendedor = {
      id: uid(),
      nombre,
      telefono: form.telefono.trim(),
      email: form.email.trim(),
      zona: form.zona.trim(),
      objetivo: form.objetivo.trim(),
      activo: form.activo,
      createdAt: new Date().toISOString(),
    }

    setItems((prev) => [next, ...prev])
    setForm(EMPTY_FORM)
  }

  function toggle(id: string): void {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, activo: !item.activo } : item)),
    )
  }

  function remove(id: string): void {
    const ok = window.confirm('¿Eliminar este vendedor?')
    if (!ok) return

    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <section className="vendedores">
      <div className="ventas-section-head ventas-section-head--compact">
        <div>
          <h2>Vendedores</h2>
          <p>Equipo comercial activo.</p>
        </div>

        <span className="ventas-counter">
          {activos}/{items.length}
        </span>
      </div>

      <div className="vendedores__form">
        <input
          value={form.nombre}
          onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          placeholder="Nombre del vendedor"
        />

        <input
          value={form.telefono}
          onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
          placeholder="Teléfono"
        />

        <input
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          placeholder="Email"
        />

        <input
          value={form.zona}
          onChange={(e) => setForm((p) => ({ ...p, zona: e.target.value }))}
          placeholder="Zona"
        />

        <input
          value={form.objetivo}
          onChange={(e) => setForm((p) => ({ ...p, objetivo: e.target.value }))}
          placeholder="Objetivo / cartera"
        />

        <button
          type="button"
          className="btn btn--primary vendedores__add"
          onClick={submit}
          disabled={!form.nombre.trim()}
        >
          + Agregar vendedor
        </button>
      </div>

      <div className="vendedores__list">
        {items.length === 0 ? (
          <div className="ventas-empty">Todavía no hay vendedores cargados.</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="vendedor-card">
              <div className="vendedor-card__avatar">
                {item.nombre.slice(0, 1).toUpperCase()}
              </div>

              <div className="vendedor-card__body">
                <div className="vendedor-card__top">
                  <strong>{item.nombre}</strong>

                  <button
                    type="button"
                    className={
                      item.activo
                        ? 'vendedor-card__state is-active'
                        : 'vendedor-card__state'
                    }
                    onClick={() => toggle(item.id)}
                  >
                    {item.activo ? 'Activo' : 'Pausado'}
                  </button>
                </div>

                <p>{item.zona || 'Sin zona asignada'}</p>

                <div className="vendedor-card__mini">
                  <span>{item.telefono || '-'}</span>
                  <span>{item.email || '-'}</span>
                </div>

                {item.objetivo ? <small>{item.objetivo}</small> : null}
              </div>

              <button
                type="button"
                className="vendedor-card__delete"
                onClick={() => remove(item.id)}
                title="Eliminar"
              >
                ×
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  )
}