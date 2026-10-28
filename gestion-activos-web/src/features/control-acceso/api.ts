import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { components, paths } from '../../api/schema'
import { ejecutar } from '../../shared/api/errores.ts'

type S = components['schemas']
export type Solicitud = S['ControlAccesoDto']
export type EntradaHistorial = S['HistorialControlAccesoDto']
export type TipoAcceso = Solicitud['tipoAcceso']
export type TipoSolicitud = Solicitud['tipoSolicitud']
export type EstadoSolicitud = Solicitud['estado']
export type DatosCrear = S['CrearControlAccesoDto']
export type DatosEditar = S['EditarControlAccesoDto']
export type FiltrosSolicitudes = NonNullable<paths['/api/control-acceso']['get']['parameters']['query']>

const claves = {
  todo: ['control-acceso'] as const,
  lista: (f: FiltrosSolicitudes) => ['control-acceso', 'lista', f] as const,
  una: (id: number) => ['control-acceso', 'una', id] as const,
  historial: (id: number) => ['control-acceso', 'historial', id] as const,
  elegibles: (f: object) => ['control-acceso', 'elegibles', f] as const,
}

export function useSolicitudes(filtros: FiltrosSolicitudes) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () => ejecutar(api.GET('/api/control-acceso', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useSolicitud(id: number) {
  return useQuery({
    queryKey: claves.una(id),
    queryFn: () => ejecutar(api.GET('/api/control-acceso/{id}', { params: { path: { id } } })),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useHistorial(id: number) {
  return useQuery({
    queryKey: claves.historial(id),
    queryFn: () => ejecutar(api.GET('/api/control-acceso/{id}/historial', { params: { path: { id } } })),
    enabled: Number.isInteger(id) && id > 0,
  })
}

/** Activos elegibles para el tipo de acceso: los filtra el servidor (categoría marcada en Catálogos). */
export function useActivosElegibles(tipoAcceso: TipoAcceso, q: string, categoriaId: number | undefined, page: number) {
  const query = { tipoAcceso, q: q || undefined, categoriaId, page, limit: 20 }
  return useQuery({
    queryKey: claves.elegibles(query),
    queryFn: () => ejecutar(api.GET('/api/control-acceso/activos-elegibles', { params: { query } })),
    placeholderData: keepPreviousData,
  })
}

export function useCategoriasElegibles(tipoAcceso: TipoAcceso) {
  return useQuery({
    queryKey: claves.elegibles({ categorias: tipoAcceso }),
    queryFn: () => ejecutar(api.GET('/api/control-acceso/categorias-elegibles', { params: { query: { tipoAcceso } } })),
  })
}

/**
 * Tras cualquier operación se refrescan listado, detalle e historial; se usa en onSettled:
 * también tras un error (p. ej. 409 porque el registro cambió en otra pestaña), para que la
 * ficha y la tabla muestren lo que confirma el servidor y no un estado antiguo.
 */
function useInvalidar() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: claves.todo })
}

export function useCrearSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (datos: DatosCrear) => ejecutar(api.POST('/api/control-acceso', { body: datos })),
    onSettled: invalidar,
  })
}

export function useEditarSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosEditar }) =>
      ejecutar(api.PATCH('/api/control-acceso/{id}', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

export function usePasarAPendiente() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => ejecutar(api.PATCH('/api/control-acceso/{id}/pendiente', { params: { path: { id } } })),
    onSettled: invalidar,
  })
}

export function useCerrarSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: S['CerrarControlAccesoDto'] }) =>
      ejecutar(api.PATCH('/api/control-acceso/{id}/cerrar', { params: { path: { id } }, body: datos })),
    onSettled: invalidar,
  })
}

export function useReabrirSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      ejecutar(api.PATCH('/api/control-acceso/{id}/reabrir', { params: { path: { id } }, body: { motivo } })),
    onSettled: invalidar,
  })
}
