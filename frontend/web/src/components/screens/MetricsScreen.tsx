import React, { useMemo, useState } from 'react'

type MetricTab = 'resumen' | 'vendedores' | 'planes' | 'contratos'

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
}

type SellerMetric = HomeSeller & {
  llamados: number
  interesados: number
  contratosEnviados: number
  padronCount: number
  conversionInteresados: number
  conversionContratos: number
  prioridad: SellerPriority
  zonasManager: string
  objetivoMensual: string
}

type PlanStatus = 'activo' | 'pausado' | 'baja'
type PlanKind = 'plan' | 'oferta'
type PlanPriority = 'alta' | 'media' | 'baja'
type PlanAudience = 'empresa' | 'particular' | 'familiar' | 'corporativo'

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
  createdAt: string
}

const HOME_SELLERS_KEY = 'medic_ventas_vendedores_v1'
const MANAGER_DATA_KEY = 'medic_ventas_vendedores_manager_v1'
const PLANS_KEY = 'medic_ventas_planes_v1'

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

function isSellerPriority(value: string): value is SellerPriority {
  return value === 'alta' || value === 'media' || value === 'baja'
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

function parseManagerData(value: unknown): SellerManagerData | null {
  if (!isRecord(value)) return null

  const sellerId = getString(value, 'sellerId')
  if (!sellerId) return null

  const rawPriority = getString(value, 'prioridad')

  return {
    sellerId,
    zonas: getString(value, 'zonas'),
    observaciones: getString(value, 'observaciones'),
    objetivoMensual: getString(value, 'objetivoMensual'),
    prioridad: isSellerPriority(rawPriority) ? rawPriority : 'media',
    llamados: getNumber(value, 'llamados'),
    interesados: getNumber(value, 'interesados'),
    contratosEnviados: getNumber(value, 'contratosEnviados'),
    padronManual: getString(value, 'padronManual'),
  }
}

function parsePlan(value: unknown): PlanItem | null {
  if (!isRecord(value)) return null

  const id = getString(value, 'id')
  const nombre = getString(value, 'nombre')

  if (!id || !nombre) return null

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
    createdAt: getString(value, 'createdAt'),
  }
}

function readArray<T>(key: string, parser: (value: unknown) => T | null): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.map((item) => parser(item)).filter((item): item is T => item !== null)
  } catch {
    return []
  }
}

function getPadronCount(value: string): number {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean).length
}

function getPercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function formatPercent(value: number): string {
  return `${value}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value)
}

function isOfferExpired(plan: PlanItem): boolean {
  if (plan.tipo !== 'oferta') return false
  if (!plan.vigenciaHasta) return false

  const end = new Date(`${plan.vigenciaHasta}T23:59:59`)
  return end.getTime() < Date.now()
}

export function MetricsScreen() {
  const [activeTab, setActiveTab] = useState<MetricTab>('resumen')
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const homeSellers = useMemo(() => readArray(HOME_SELLERS_KEY, parseHomeSeller), [])
  const managerData = useMemo(() => readArray(MANAGER_DATA_KEY, parseManagerData), [])
  const plans = useMemo(() => readArray(PLANS_KEY, parsePlan), [])

  const sellers = useMemo<SellerMetric[]>(() => {
    return homeSellers.map((seller) => {
      const manager = managerData.find((item) => item.sellerId === seller.id)

      const llamados = manager?.llamados ?? 0
      const interesados = manager?.interesados ?? 0
      const contratosEnviados = manager?.contratosEnviados ?? 0
      const padronCount = getPadronCount(manager?.padronManual ?? '')

      return {
        ...seller,
        llamados,
        interesados,
        contratosEnviados,
        padronCount,
        conversionInteresados: getPercent(interesados, llamados),
        conversionContratos: getPercent(contratosEnviados, interesados),
        prioridad: manager?.prioridad ?? 'media',
        zonasManager: manager?.zonas ?? '',
        objetivoMensual: manager?.objetivoMensual ?? '',
      }
    })
  }, [homeSellers, managerData])

  const selectedSeller = useMemo(() => {
    return sellers.find((seller) => seller.id === selectedSellerId) ?? sellers[0] ?? null
  }, [sellers, selectedSellerId])

  const topSellers = useMemo(() => {
    return [...sellers].sort((a, b) => b.contratosEnviados - a.contratosEnviados).slice(0, 5)
  }, [sellers])

  const topPlans = useMemo(() => {
    return [...plans].sort((a, b) => b.cierres - a.cierres).slice(0, 6)
  }, [plans])

  const mostConsultedPlans = useMemo(() => {
    return [...plans].sort((a, b) => b.consultas - a.consultas).slice(0, 6)
  }, [plans])

  const totals = useMemo(() => {
    const llamados = sellers.reduce((acc, item) => acc + item.llamados, 0)
    const interesados = sellers.reduce((acc, item) => acc + item.interesados, 0)
    const contratos = sellers.reduce((acc, item) => acc + item.contratosEnviados, 0)
    const padrones = sellers.reduce((acc, item) => acc + item.padronCount, 0)

    const planConsultas = plans.reduce((acc, item) => acc + item.consultas, 0)
    const planCierres = plans.reduce((acc, item) => acc + item.cierres, 0)

    return {
      llamados,
      interesados,
      contratos,
      padrones,
      conversionInteresados: getPercent(interesados, llamados),
      conversionContratos: getPercent(contratos, interesados),
      planConsultas,
      planCierres,
      conversionPlanes: getPercent(planCierres, planConsultas),
      planesActivos: plans.filter((item) => item.estado === 'activo').length,
      ofertasActivas: plans.filter((item) => item.tipo === 'oferta' && !isOfferExpired(item)).length,
      ofertasVencidas: plans.filter((item) => isOfferExpired(item)).length,
    }
  }, [sellers, plans])

  const planAudienceStats = useMemo(() => {
    const map = new Map<string, number>()

    for (const plan of plans) {
      map.set(plan.publico, (map.get(plan.publico) ?? 0) + plan.cierres)
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [plans])

  return (
    <main className="metrics-screen">
      <section className="metrics-screen__hero">
        <div>
          <p className="metrics-screen__eyebrow">Análisis comercial</p>
          <h1>Mis métricas</h1>
          <p>
            Visualizá ventas, conversiones, rendimiento por vendedor, planes más vendidos y
            seguimiento comercial general.
          </p>
        </div>

        <div className="metrics-screen__heroStats">
          <span>
            <strong>{formatNumber(totals.contratos)}</strong>
            Contratos
          </span>
          <span>
            <strong>{formatNumber(totals.llamados)}</strong>
            Llamados
          </span>
          <span>
            <strong>{formatPercent(totals.conversionContratos)}</strong>
            Conversión
          </span>
        </div>
      </section>

      <section className="metrics-screen__layout">
        <section className="metrics-panel">
          <div className="metrics-tabs">
            <button
              type="button"
              className={activeTab === 'resumen' ? 'is-active' : ''}
              onClick={() => setActiveTab('resumen')}
            >
              Resumen
            </button>
            <button
              type="button"
              className={activeTab === 'vendedores' ? 'is-active' : ''}
              onClick={() => setActiveTab('vendedores')}
            >
              Vendedores
            </button>
            <button
              type="button"
              className={activeTab === 'planes' ? 'is-active' : ''}
              onClick={() => setActiveTab('planes')}
            >
              Planes
            </button>
            <button
              type="button"
              className={activeTab === 'contratos' ? 'is-active' : ''}
              onClick={() => setActiveTab('contratos')}
            >
              Contratos
            </button>
          </div>

          {activeTab === 'resumen' ? (
            <>
              <div className="metrics-kpis">
                <article>
                  <span>Llamados realizados</span>
                  <strong>{formatNumber(totals.llamados)}</strong>
                  <p>Total cargado desde Mis vendedores.</p>
                </article>

                <article>
                  <span>Interesados</span>
                  <strong>{formatNumber(totals.interesados)}</strong>
                  <p>{formatPercent(totals.conversionInteresados)} sobre llamados.</p>
                </article>

                <article>
                  <span>Contratos enviados</span>
                  <strong>{formatNumber(totals.contratos)}</strong>
                  <p>{formatPercent(totals.conversionContratos)} sobre interesados.</p>
                </article>

                <article>
                  <span>Teléfonos en padrón</span>
                  <strong>{formatNumber(totals.padrones)}</strong>
                  <p>Base comercial asignada.</p>
                </article>
              </div>

              <div className="metrics-two-cols">
                <section className="metrics-card">
                  <div className="metrics-card__head">
                    <h2>Top vendedores</h2>
                    <p>Ordenados por contratos enviados.</p>
                  </div>

                  <div className="metrics-ranking">
                    {topSellers.length === 0 ? (
                      <div className="metrics-empty">Todavía no hay vendedores cargados.</div>
                    ) : (
                      topSellers.map((seller, index) => (
                        <article key={seller.id}>
                          <span className="metrics-ranking__pos">#{index + 1}</span>

                          <div>
                            <strong>{seller.nombre}</strong>
                            <small>
                              {seller.contratosEnviados} contratos · {seller.llamados} llamados
                            </small>
                          </div>

                          <em>{formatPercent(seller.conversionContratos)}</em>
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className="metrics-card">
                  <div className="metrics-card__head">
                    <h2>Planes más vendidos</h2>
                    <p>Ordenados por cierres cargados en Mis planes.</p>
                  </div>

                  <div className="metrics-ranking">
                    {topPlans.length === 0 ? (
                      <div className="metrics-empty">Todavía no hay planes cargados.</div>
                    ) : (
                      topPlans.map((plan, index) => (
                        <article key={plan.id}>
                          <span className="metrics-ranking__pos">#{index + 1}</span>

                          <div>
                            <strong>{plan.nombre}</strong>
                            <small>
                              {plan.cierres} cierres · {plan.consultas} consultas
                            </small>
                          </div>

                          <em>{formatPercent(getPercent(plan.cierres, plan.consultas))}</em>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {activeTab === 'vendedores' ? (
            <section className="metrics-card">
              <div className="metrics-card__head">
                <h2>Rendimiento por vendedor</h2>
                <p>Llamados, interesados, contratos y conversiones.</p>
              </div>

              <div className="metrics-table">
                <div className="metrics-table__row metrics-table__row--head">
                  <span>Vendedor</span>
                  <span>Llamados</span>
                  <span>Interesados</span>
                  <span>Contratos</span>
                  <span>Conv. interesados</span>
                  <span>Conv. contratos</span>
                </div>

                {sellers.length === 0 ? (
                  <div className="metrics-empty">Todavía no hay vendedores cargados.</div>
                ) : (
                  sellers.map((seller) => (
                    <button
                      key={seller.id}
                      type="button"
                      className="metrics-table__row"
                      onClick={() => setSelectedSellerId(seller.id)}
                    >
                      <span>
                        <strong>{seller.nombre}</strong>
                        <small>{seller.zona || seller.zonasManager || 'Sin zona'}</small>
                      </span>
                      <span>{formatNumber(seller.llamados)}</span>
                      <span>{formatNumber(seller.interesados)}</span>
                      <span>{formatNumber(seller.contratosEnviados)}</span>
                      <span>{formatPercent(seller.conversionInteresados)}</span>
                      <span>{formatPercent(seller.conversionContratos)}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'planes' ? (
            <div className="metrics-two-cols">
              <section className="metrics-card">
                <div className="metrics-card__head">
                  <h2>Planes más vendidos</h2>
                  <p>Ranking por cierres.</p>
                </div>

                <div className="metrics-bars">
                  {topPlans.length === 0 ? (
                    <div className="metrics-empty">Todavía no hay planes cargados.</div>
                  ) : (
                    topPlans.map((plan) => {
                      const max = Math.max(...topPlans.map((item) => item.cierres), 1)
                      const width = getPercent(plan.cierres, max)

                      return (
                        <article key={plan.id}>
                          <div>
                            <strong>{plan.nombre}</strong>
                            <span>{plan.cierres} cierres</span>
                          </div>

                          <div className="metrics-bar">
                            <span style={{ width: `${width}%` }} />
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </section>

              <section className="metrics-card">
                <div className="metrics-card__head">
                  <h2>Consultas por plan</h2>
                  <p>Planes con mayor interés comercial.</p>
                </div>

                <div className="metrics-bars">
                  {mostConsultedPlans.length === 0 ? (
                    <div className="metrics-empty">Todavía no hay consultas cargadas.</div>
                  ) : (
                    mostConsultedPlans.map((plan) => {
                      const max = Math.max(...mostConsultedPlans.map((item) => item.consultas), 1)
                      const width = getPercent(plan.consultas, max)

                      return (
                        <article key={plan.id}>
                          <div>
                            <strong>{plan.nombre}</strong>
                            <span>{plan.consultas} consultas</span>
                          </div>

                          <div className="metrics-bar">
                            <span style={{ width: `${width}%` }} />
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </section>

              <section className="metrics-card metrics-card--wide">
                <div className="metrics-card__head">
                  <h2>Cierres por público objetivo</h2>
                  <p>Empresa, particular, familiar o corporativo.</p>
                </div>

                <div className="metrics-segments">
                  {planAudienceStats.length === 0 ? (
                    <div className="metrics-empty">Todavía no hay cierres cargados.</div>
                  ) : (
                    planAudienceStats.map((item) => (
                      <article key={item.name}>
                        <strong>{item.name}</strong>
                        <span>{item.value} cierres</span>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'contratos' ? (
            <section className="metrics-card">
              <div className="metrics-card__head">
                <h2>Tipos de contratos cerrados</h2>
                <p>
                  Esta vista queda preparada para cuando conectemos contratos al backend o al
                  almacenamiento persistente.
                </p>
              </div>

              <div className="metrics-placeholder">
                <strong>Módulo pendiente de conexión</strong>
                <p>
                  Cuando los contratos tengan tipo, estado, vendedor asociado, plan asociado y fecha de
                  cierre, acá vamos a mostrar:
                </p>

                <div>
                  <span>Contratos cerrados por mes</span>
                  <span>Contratos por vendedor</span>
                  <span>Contratos por plan</span>
                  <span>Contratos enviados vs firmados</span>
                  <span>Contratos pendientes de seguimiento</span>
                </div>
              </div>
            </section>
          ) : null}
        </section>

        <aside className="metrics-sidebar">
          <div className="metrics-sidebar__head">
            <h2>Métricas por vendedor</h2>
            <p>Seleccioná un vendedor para ver su detalle.</p>
          </div>

          <div className="metrics-seller-list">
            {sellers.length === 0 ? (
              <div className="metrics-empty">No hay vendedores.</div>
            ) : (
              sellers.map((seller) => (
                <button
                  key={seller.id}
                  type="button"
                  className={
                    'metrics-seller-button' +
                    (selectedSeller?.id === seller.id ? ' metrics-seller-button--active' : '')
                  }
                  onClick={() => setSelectedSellerId(seller.id)}
                >
                  <span>{seller.nombre.slice(0, 1).toUpperCase()}</span>

                  <div>
                    <strong>{seller.nombre}</strong>
                    <small>
                      {seller.contratosEnviados} contratos · {seller.conversionContratos}% conv.
                    </small>
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedSeller ? (
            <div className="metrics-seller-detail">
              <h3>{selectedSeller.nombre}</h3>

              <div className="metrics-seller-detail__grid">
                <span>
                  <strong>{formatNumber(selectedSeller.padronCount)}</strong>
                  Teléfonos
                </span>
                <span>
                  <strong>{formatNumber(selectedSeller.llamados)}</strong>
                  Llamados
                </span>
                <span>
                  <strong>{formatNumber(selectedSeller.interesados)}</strong>
                  Interesados
                </span>
                <span>
                  <strong>{formatNumber(selectedSeller.contratosEnviados)}</strong>
                  Contratos
                </span>
              </div>

              <div className="metrics-seller-detail__box">
                <strong>Objetivo mensual</strong>
                <p>{selectedSeller.objetivoMensual || selectedSeller.objetivo || 'Sin objetivo cargado.'}</p>
              </div>

              <div className="metrics-seller-detail__box">
                <strong>Zonas</strong>
                <p>{selectedSeller.zonasManager || selectedSeller.zona || 'Sin zona cargada.'}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}