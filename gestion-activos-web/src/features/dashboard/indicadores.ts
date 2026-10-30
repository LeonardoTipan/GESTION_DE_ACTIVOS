import type { Indicadores } from './api.ts'

export interface Linea {
  etiqueta: string
  valor: number
  /** Resalta en rojo/naranja lo que requiere atención (solo si es mayor que cero). */
  alerta?: 'red' | 'orange'
}

/** Tarjetas por módulo con los conteos reales del backend (GET /api/dashboard/indicadores). */
export function tarjetasDe(i: Indicadores): { titulo: string; ruta: string; lineas: Linea[] }[] {
  return [
    { titulo: 'Inventario', ruta: '/activos', lineas: [{ etiqueta: 'Activos (sin bajas)', valor: i.inventario.total }, { etiqueta: 'Operativos', valor: i.inventario.operativos }] },
    {
      titulo: 'Mantenimientos',
      ruta: '/mantenimientos',
      lineas: [
        { etiqueta: 'Próximos 30 días', valor: i.mantenimientos.proximos30Dias },
        { etiqueta: 'Planes vencidos (sin programar)', valor: i.mantenimientos.planesVencidos, alerta: 'red' },
        { etiqueta: 'Programados', valor: i.mantenimientos.programados },
        { etiqueta: 'En ejecución', valor: i.mantenimientos.enEjecucion },
        { etiqueta: 'Ejecuciones con plazo vencido', valor: i.mantenimientos.ejecucionesVencidas, alerta: 'red' },
        { etiqueta: 'Completados', valor: i.mantenimientos.finalizados },
      ],
    },
    {
      titulo: 'Respaldos',
      ruta: '/respaldos',
      lineas: [
        { etiqueta: 'Planes vigentes', valor: i.respaldos.planesVigentes },
        { etiqueta: 'Fallidos (30 días)', valor: i.respaldos.fallidas30Dias, alerta: 'red' },
        { etiqueta: 'Parciales (30 días)', valor: i.respaldos.parciales30Dias, alerta: 'orange' },
      ],
    },
    {
      titulo: 'Vulnerabilidades',
      ruta: '/vulnerabilidades',
      lineas: [
        { etiqueta: 'Abiertas', valor: i.vulnerabilidades.abiertas, alerta: 'orange' },
        { etiqueta: 'En progreso', valor: i.vulnerabilidades.enProgreso },
        { etiqueta: 'Fuera de plazo', valor: i.vulnerabilidades.vencidas, alerta: 'red' },
        { etiqueta: 'Críticas pendientes', valor: i.vulnerabilidades.criticasPendientes, alerta: 'red' },
        { etiqueta: 'Remediadas', valor: i.vulnerabilidades.remediadas },
      ],
    },
    {
      titulo: 'Renovaciones',
      ruta: '/renovaciones',
      lineas: [
        { etiqueta: `Por vencer (${i.renovaciones.diasAviso} días)`, valor: i.renovaciones.proximasAVencer, alerta: 'orange' },
        { etiqueta: 'Caducadas', valor: i.renovaciones.caducadas, alerta: 'red' },
        { etiqueta: 'Pendientes', valor: i.renovaciones.pendientes },
        { etiqueta: 'Cerradas', valor: i.renovaciones.cerradas },
      ],
    },
    {
      titulo: 'Control de acceso',
      ruta: '/control-acceso',
      lineas: [
        { etiqueta: 'Abiertas', valor: i.accesos.abiertas },
        { etiqueta: 'En gestión', valor: i.accesos.enGestion },
        { etiqueta: 'Cerradas', valor: i.accesos.cerradas },
      ],
    },
    {
      titulo: 'Protección de Endpoints',
      ruta: '/proteccion-endpoints',
      lineas: [
        { etiqueta: 'Períodos abiertos', valor: i.endpoints.abiertos, alerta: 'orange' },
        { etiqueta: 'En progreso', valor: i.endpoints.enProgreso },
        { etiqueta: 'Cerrados', valor: i.endpoints.cerrados },
      ],
    },
    {
      titulo: 'Evaluación de Sistemas',
      ruta: '/evaluacion-sistemas-productivos',
      lineas: [
        { etiqueta: 'Pendientes', valor: i.evaluaciones.abiertos },
        { etiqueta: 'En progreso', valor: i.evaluaciones.enProgreso },
        { etiqueta: 'Vencidas', valor: i.evaluaciones.vencidas, alerta: 'red' },
        { etiqueta: 'Cerradas', valor: i.evaluaciones.cerrados },
      ],
    },
  ]
}
