import React from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../auth/ProtectedRoute'

import { AppShell } from '../components/layout/AppShell'
import { LoginScreen } from '../components/screens/LoginScreen'
import { DashboardScreen } from '../components/screens/DashboardScreen'
import { RecipientsScreen } from '../components/screens/RecipientsScreen'
import { WhatsappScreen } from '../components/screens/WhatsappScreen'

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
      { index: true, element: <DashboardScreen /> },
      { path: 'recipients', element: <RecipientsScreen /> },
      { path: 'whatsapp', element: <WhatsappScreen /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
