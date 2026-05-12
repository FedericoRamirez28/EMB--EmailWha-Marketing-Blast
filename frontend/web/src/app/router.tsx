import React from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../auth/ProtectedRoute'

import { AppShell } from '../components/layout/AppShell'
import { LoginScreen } from '../components/screens/LoginScreen'
import HomeVentasScreen from '../components/screens/HomeVentasScreen'
import { ContractsScreen } from '../components/screens/ContractsScreen'
import { RecipientsScreen } from '../components/screens/RecipientsScreen'
import { WhatsappScreen } from '../components/screens/WhatsappScreen'
import { SellersScreen } from '../components/screens/SellersScreen'
import { PlansScreen } from '../components/screens/PlansScreen'
import { MetricsScreen } from '../components/screens/MetricsScreen'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginScreen />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <HomeVentasScreen />,
      },
      {
        path: 'contratos',
        element: <ContractsScreen />,
      },
      {
  path: 'planes',
  element: <PlansScreen />,
},
      {
  path: 'vendedores',
  element: <SellersScreen />,
},
{
  path: 'metricas',
  element: <MetricsScreen />,
},
      {
        path: 'email',
        element: <RecipientsScreen />,
      },
      {
        path: 'recipients',
        element: <Navigate to="/email" replace />,
      },
      {
        path: 'whatsapp',
        element: <WhatsappScreen />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])