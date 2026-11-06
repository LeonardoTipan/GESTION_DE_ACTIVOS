import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

export type PeriodoEndpoint = components['schemas']['PeriodoEndpointDto']
export type EstadoPeriodo = PeriodoEndpoint['estado']
export type FiltrosApiPeriodos = NonNullable<paths['/api/proteccion-endpoints/periodos']['get']['parameters']['query']>
export type DatosRegistroPeriodo = components['schemas']['DatosRegistroPeriodoDto']
export type EquipoPeriodo = components['schemas']['EquipoPeriodoDetalleDto']

const claves = {
  todo: ['proteccion-endpoints'] as const,
  lista: (f: FiltrosApiPeriodos) => ['proteccion-endpoints', 'periodos', f] as const,
  detalle: (id: number) => ['proteccion-endpoints', 'detalle', id] as const,
  equipos: (id: number) => ['proteccion-endpoints', 'equipos', id] as const,
}

export function usePeriodos(filtros: FiltrosApiPeriodos) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function usePeriodo(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos/{id}', { params: { path: { id } } })),
  })
}

/** Equipos del período (activos reales) y su antivirus. Solo si el período tiene detalle. */
export function useEquiposPeriodo(id: number, activo = true) {
  return useQuery({
    queryKey: claves.equipos(id),
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos/{id}/equipos', { params: { path: { id } } })),
    enabled: activo && id > 0,
  })
}

/** La lista del período frente a los equipos elegibles de hoy (solo informa). */
export function useComparacionInventario(id: number, activo = true) {
  return useQuery({
    queryKey: ['proteccion-endpoints', 'comparacion', id],
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos/{id}/comparacion-inventario', { params: { path: { id } } })),
    enabled: activo && id > 0,
  })
}

/**
 * Tras cualquier operación (también si falla: p. ej. 409 porque otra persona lo cerró) se
 * refrescan el módulo, sus trazas, el panel y el calendario: la pantalla muestra lo confirmado.
 */
function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: claves.todo })
    void queryClient.invalidateQueries({ queryKey: ['trazas'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['agenda'] })
  }
}

/** Bitácora General mensual del Excel (calculada en el backend). */
export function useBitacoraGeneralEndpoints(anio: number) {
  return useQuery({
    queryKey: [...claves.todo, 'bitacora', 'general', anio],
    queryFn: () => ejecutar(api.GET('/api/proteccion-endpoints/periodos/bitacora/general', { params: { query: { anio } } })),
    placeholderData: keepPreviousData,
  })
}

/** Fase 1 · abrir un período mensual. */
export function useAbrirPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: components['schemas']['AbrirPeriodoDto']) =>
      ejecutar(api.POST('/api/proteccion-endpoints/periodos', { body: datos })),
    onSettled: invalidar,
  })
}

/** Fase 2 · guardar avance (el período queda En progreso; no se cierra). */
export function useRegistrarPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosRegistroPeriodo }) =>
      ejecutar(api.PATCH('/api/proteccion-endpoints/periodos/{id}/registro', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** Fase 2 · cerrar el período (el backend exige totales, medición, verificable y repositorio). */
export function useCerrarPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosRegistroPeriodo }) =>
      ejecutar(api.PATCH('/api/proteccion-endpoints/periodos/{id}/cerrar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

/** Períodos anteriores al detalle: carga los equipos sujetos a control de hoy (una vez). */
export function useCargarEquipos() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => ejecutar(api.POST('/api/proteccion-endpoints/periodos/{id}/equipos', { params: { path: { id } } })),
    onSettled: invalidar,
  })
}

/** Reabrir (solo admin, con motivo): vuelve a En progreso conservando los datos. */
export function useReabrirPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/proteccion-endpoints/periodos/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSettled: invalidar,
  })
}
