import React from 'react'
import { PrestadorPanel } from '@/components/ui/ventas/PrestadorPanel'
import { VendedorPanel } from '@/components/ui/ventas/VendedorPanel'
import { SalesCalendar } from '@/components/ui/ventas/SalesCalendar'

export default function HomeVentasScreen() {
  return (
    <main className="ventas-home">
      <section className="ventas-home__hero">
        <div>
          <p className="ventas-home__eyebrow">Gestión comercial</p>
          <h1 className="ventas-home__title">Panel de ventas MEDIC</h1>
          <p className="ventas-home__subtitle">
            Organizá prestadores, vendedores, reuniones y acciones comerciales desde un solo lugar.
          </p>
        </div>

        <div className="ventas-home__heroBadge">
          <span>MEDIC</span>
          <strong>Ventas</strong>
        </div>
      </section>

      <section className="ventas-home__grid">
        <div className="ventas-home__main">
          <div className="ventas-card">
            <PrestadorPanel />
          </div>

          <div className="ventas-card">
            <SalesCalendar />
          </div>
        </div>

        <aside className="ventas-home__side">
          <div className="ventas-card ventas-card--sticky">
            <VendedorPanel />
          </div>
        </aside>
      </section>
    </main>
  )
}