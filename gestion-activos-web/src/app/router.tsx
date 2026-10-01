import { createBrowserRouter } from 'react-router'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { RequireRole } from '../features/auth/RequireRole.tsx'
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx'
import { EnConstruccion } from '../shared/components/EnConstruccion.tsx'
import { PaginaNoEncontrada } from '../shared/components/PaginaNoEncontrada.tsx'
import { AppLayout } from './layout/AppLayout.tsx'

/**
 * Rutas de la aplicación. Todo cuelga de AuthGate (exige sesión) y AppLayout.
 * Cada fase sustituirá un EnConstruccion por la página real de su feature.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthGate>
        <AppLayout />
      </AuthGate>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activos', element: <EnConstruccion modulo="Inventario" fase={2} /> },
      { path: 'respaldos', element: <EnConstruccion modulo="Respaldos" fase={3} /> },
      {
        path: 'mantenimientos',
        element: <EnConstruccion modulo="Mantenimientos" fase={3} />,
      },
      {
        path: 'vulnerabilidades',
        element: <EnConstruccion modulo="Vulnerabilidades" fase={3} />,
      },
      {
        path: 'catalogos',
        element: (
          <RequireRole roles={['admin']}>
            <EnConstruccion modulo="Catálogos" fase={2} />
          </RequireRole>
        ),
      },
      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
])
