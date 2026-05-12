import React, { useEffect, useMemo, useState } from 'react'

type CalendarEventType = 'reunion' | 'llamado' | 'visita' | 'tarea'

type CalendarEvent = {
  id: string
  date: string
  title: string
  time: string
  type: CalendarEventType
  notes: string
  createdAt: string
}

type CalendarEventForm = {
  title: string
  time: string
  type: CalendarEventType
  notes: string
}

type CalendarCell = {
  iso: string
  day: number
  inMonth: boolean
}

const STORAGE_KEY = 'medic_ventas_calendar_v1'

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const EMPTY_FORM: CalendarEventForm = {
  title: '',
  time: '',
  type: 'reunion',
  notes: '',
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function isoDay(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDayAR(iso: string): string {
  const parts = iso.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]

  if (!y || !m || !d) return iso

  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function isCalendarEventType(value: string): value is CalendarEventType {
  return value === 'reunion' || value === 'llamado' || value === 'visita' || value === 'tarea'
}

function parseCalendarEvent(value: unknown): CalendarEvent | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const date = getString(value, 'date')
  const title = getString(value, 'title')
  const rawType = getString(value, 'type')

  if (!id || !date || !title) return null

  return {
    id,
    date,
    title,
    time: getString(value, 'time'),
    type: isCalendarEventType(rawType) ? rawType : 'reunion',
    notes: getString(value, 'notes'),
    createdAt: getString(value, 'createdAt'),
  }
}

function readEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => parseCalendarEvent(item))
      .filter((item): item is CalendarEvent => item !== null)
  } catch {
    return []
  }
}

function saveEvents(items: CalendarEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function buildCells(anchor: Date): CalendarCell[] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()

  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)

  const firstDowMonday = (first.getDay() + 6) % 7
  const totalDays = last.getDate()

  const cells: CalendarCell[] = []

  for (let i = 0; i < firstDowMonday; i += 1) {
    cells.push({ iso: '', day: 0, inMonth: false })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({
      iso: isoDay(new Date(year, month, day)),
      day,
      inMonth: true,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ iso: '', day: 0, inMonth: false })
  }

  return cells
}

export function SalesCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => readEvents())
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selected, setSelected] = useState<string>(() => isoDay(new Date()))
  const [form, setForm] = useState<CalendarEventForm>(EMPTY_FORM)

  useEffect(() => {
    saveEvents(events)
  }, [events])

  const cells = useMemo(() => buildCells(anchor), [anchor])
  const todayIso = useMemo(() => isoDay(new Date()), [])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    for (const item of events) {
      const current = map.get(item.date) ?? []
      map.set(item.date, [...current, item])
    }

    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => {
          const at = a.time || '99:99'
          const bt = b.time || '99:99'
          return at.localeCompare(bt)
        }),
      )
    }

    return map
  }, [events])

  const selectedEvents = eventsByDay.get(selected) ?? []

  function moveMonth(delta: number): void {
    setAnchor((prev) => {
      const next = new Date(prev)
      next.setMonth(prev.getMonth() + delta)
      next.setDate(1)
      return next
    })
  }

  function goToday(): void {
    const today = new Date()
    const first = new Date(today)
    first.setDate(1)
    setAnchor(first)
    setSelected(isoDay(today))
  }

  function addEvent(): void {
    const title = form.title.trim()
    if (!title) return

    const next: CalendarEvent = {
      id: uid(),
      date: selected,
      title,
      time: form.time.trim(),
      type: form.type,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
    }

    setEvents((prev) => [next, ...prev])
    setForm(EMPTY_FORM)
  }

  function removeEvent(id: string): void {
    const ok = window.confirm('¿Eliminar este evento?')
    if (!ok) return

    setEvents((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <section className="sales-calendar">
      <div className="ventas-section-head">
        <div>
          <h2>Calendario comercial</h2>
          <p>Agendá reuniones, visitas, llamados y tareas del equipo de ventas.</p>
        </div>

        <div className="sales-calendar__nav">
          <button type="button" onClick={() => moveMonth(-1)}>
            ‹
          </button>

          <strong>
            {MONTHS[anchor.getMonth()]} de {anchor.getFullYear()}
          </strong>

          <button type="button" onClick={() => moveMonth(1)}>
            ›
          </button>

          <button type="button" onClick={goToday}>
            Hoy
          </button>
        </div>
      </div>

      <div className="sales-calendar__layout">
        <div className="sales-calendar__calendar">
          <div className="sales-calendar__dow">
            {DAYS.map((d, index) => (
              <span key={`${d}-${index}`}>{d}</span>
            ))}
          </div>

          <div className="sales-calendar__grid">
            {cells.map((cell, index) => {
              const dayEvents = cell.iso ? eventsByDay.get(cell.iso) ?? [] : []
              const isSelected = cell.iso === selected
              const isToday = cell.iso === todayIso

              return (
                <button
                  key={`${cell.iso}-${index}`}
                  type="button"
                  disabled={!cell.inMonth}
                  className={
                    'sales-calendar__day' +
                    (isSelected ? ' sales-calendar__day--selected' : '') +
                    (isToday ? ' sales-calendar__day--today' : '')
                  }
                  onClick={() => {
                    if (cell.iso) setSelected(cell.iso)
                  }}
                >
                  {cell.inMonth ? (
                    <>
                      <span className="sales-calendar__num">{cell.day}</span>

                      <div className="sales-calendar__marks">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`sales-calendar__mark sales-calendar__mark--${ev.type}`}
                          >
                            {ev.time ? `${ev.time} · ` : ''}
                            {ev.title}
                          </span>
                        ))}

                        {dayEvents.length > 3 ? (
                          <span className="sales-calendar__more">
                            +{dayEvents.length - 3} más
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="sales-calendar__side">
          <div className="sales-calendar__selected">
            <span>Día seleccionado</span>
            <strong>{formatDayAR(selected)}</strong>
          </div>

          <div className="sales-calendar__form">
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Título: reunión, visita, llamado..."
            />

            <div className="sales-calendar__formRow">
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
              />

              <select
                value={form.type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    type: e.target.value as CalendarEventType,
                  }))
                }
              >
                <option value="reunion">Reunión</option>
                <option value="llamado">Llamado</option>
                <option value="visita">Visita</option>
                <option value="tarea">Tarea</option>
              </select>
            </div>

            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notas del evento..."
            />

            <button
              type="button"
              className="btn btn--primary"
              onClick={addEvent}
              disabled={!form.title.trim()}
            >
              + Agendar
            </button>
          </div>

          <div className="sales-calendar__events">
            {selectedEvents.length === 0 ? (
              <div className="ventas-empty">No hay eventos para este día.</div>
            ) : (
              selectedEvents.map((event) => (
                <article key={event.id} className={`sales-event sales-event--${event.type}`}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {event.time || 'Sin horario'} · {event.type}
                    </span>

                    {event.notes ? <p>{event.notes}</p> : null}
                  </div>

                  <button type="button" onClick={() => removeEvent(event.id)}>
                    ×
                  </button>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}