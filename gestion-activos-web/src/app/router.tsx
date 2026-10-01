import { createBrowserRouter } from 'react-router'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { RequireRole } from '../features/auth/RequireRole.tsx'
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx'
import { ActivosPage } from '../features/inventario/activos/ActivosPage.tsx'
import { CatalogosPage } from '../features/inventario/catalogos/CatalogosPage.tsx'
import { ActivoFichaPage } from '../features/inventario/ficha/ActivoFichaPage.tsx'
import { MantenimientoPage } from '../features/mantenimientos/MantenimientoPage.tsx'
import { MantenimientosPage } from '../features/mantenimientos/MantenimientosPage.tsx'
import { RespaldoPage } from '../features/respaldos/RespaldoPage.tsx'
import { RespaldosPage } from '../features/respaldos/RespaldosPage.tsx'
import { VulnerabilidadPage } from '../features/vulnerabilidades/VulnerabilidadPage.tsx'
import { VulnerabilidadesPage } from '../features/vulnerabilidades/VulnerabilidadesPage.tsx'
import { PaginaNoEncontrada } from '../shared/components/PaginaNoEncontrada.tsx'
import { AppLayout } from './layout/AppLayout.tsx'

/** Rutas de la aplicación. Todo cuelga de AuthGate (exige sesión) y AppLayout. */
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
      { path: 'respaldos', element: <RespaldosPage /> },
      { path: 'respaldos/:id', element: <RespaldoPage /> },
      { path: 'mantenimientos', element: <MantenimientosPage /> },
      { path: 'mantenimientos/:id', element: <MantenimientoPage /> },
      { path: 'vulnerabilidades', element: <VulnerabilidadesPage /> },
      { path: 'vulnerabilidades/:id', element: <VulnerabilidadPage /> },
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
