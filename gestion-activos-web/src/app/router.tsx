import { createBrowserRouter } from 'react-router'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { RequireRole } from '../features/auth/RequireRole.tsx'
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx'
import { ActivosPage } from '../features/inventario/activos/ActivosPage.tsx'
import { CatalogosPage } from '../features/inventario/catalogos/CatalogosPage.tsx'
import { ActivoFichaPage } from '../features/inventario/ficha/ActivoFichaPage.tsx'
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
      { path: 'activos', element: <ActivosPage /> },
      { path: 'activos/:id', element: <ActivoFichaPage /> },
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
            <CatalogosPage />
          </RequireRole>
        ),
      },
      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
])
