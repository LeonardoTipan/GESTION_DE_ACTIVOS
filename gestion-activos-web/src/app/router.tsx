import { createBrowserRouter } from 'react-router'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { RequireRole } from '../features/auth/RequireRole.tsx'
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx'
import { EvaluacionSistemasPage } from '../features/evaluacion-sistemas/EvaluacionSistemasPage.tsx'
import { ActivosPage } from '../features/inventario/activos/ActivosPage.tsx'
import { CatalogosPage } from '../features/inventario/catalogos/CatalogosPage.tsx'
import { RenovacionesPage } from '../features/renovaciones/RenovacionesPage.tsx'
import { RenovacionPage } from '../features/renovaciones/RenovacionPage.tsx'
import { ActivoFichaPage } from '../features/inventario/ficha/ActivoFichaPage.tsx'
import { CalendarioPage } from '../features/calendario/CalendarioPage.tsx'
import { ControlAccesoDetallePage } from '../features/control-acceso/ControlAccesoDetallePage.tsx'
import { ControlAccesoPage } from '../features/control-acceso/ControlAccesoPage.tsx'
import { MantenimientoPage } from '../features/mantenimientos/MantenimientoPage.tsx'
import { MantenimientosPage } from '../features/mantenimientos/MantenimientosPage.tsx'
import { ProteccionEndpointsPage } from '../features/proteccion-endpoints/ProteccionEndpointsPage.tsx'
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
      { path: 'mantenimientos', element: <MantenimientosPage /> },
      { path: 'mantenimientos/:id', element: <MantenimientoPage /> },
      { path: 'vulnerabilidades', element: <VulnerabilidadesPage /> },
      { path: 'vulnerabilidades/:id', element: <VulnerabilidadPage /> },
      { path: 'control-acceso', element: <ControlAccesoPage /> },
      { path: 'control-acceso/:id', element: <ControlAccesoDetallePage /> },
      { path: 'renovaciones', element: <RenovacionesPage /> },
      { path: 'renovaciones/:id', element: <RenovacionPage /> },
      // Fase 1 (planificación) de los dos módulos nuevos; la fase 2 se añadirá después.
      { path: 'proteccion-endpoints', element: <ProteccionEndpointsPage /> },
      { path: 'evaluacion-sistemas-productivos', element: <EvaluacionSistemasPage /> },
      { path: 'calendario', element: <CalendarioPage /> },
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
