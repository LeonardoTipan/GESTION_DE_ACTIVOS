import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../../../api/client.ts'
import type { components, paths } from '../../../api/schema'
import { ejecutar } from '../../../shared/api/errores.ts'

export type Vulnerabilidad = components['schemas']['VulnerabilidadDto']
export type NivelRiesgo = Vulnerabilidad['nivelRiesgo']
export type EstadoVulnerabilidad = Vulnerabilidad['estado']
type DatosRegistrar = components['schemas']['RegistrarVulnerabilidadDto']
type DatosMitigar = components['schemas']['MitigarVulnerabilidadDto']
type DatosAceptarRiesgo = components['schemas']['AceptarRiesgoDto']
export type FiltrosApiVulnerabilidades = NonNullable<
  paths['/api/vulnerabilidades']['get']['parameters']['query']
>

const claves = {
  todo: ['vulnerabilidades'] as const,
  lista: (filtros: FiltrosApiVulnerabilidades) =>
    ['vulnerabilidades', 'lista', filtros] as const,
  detalle: (id: number) => ['vulnerabilidades', 'detalle', id] as const,
}

/** La API ya las devuelve por urgencia: mayor riesgo primero y, dentro del nivel, la más antigua. */
export function useVulnerabilidades(filtros: FiltrosApiVulnerabilidades) {
  return useQuery({
    queryKey: claves.lista(filtros),
    queryFn: () =>
      ejecutar(api.GET('/api/vulnerabilidades', { params: { query: filtros } })),
    placeholderData: keepPreviousData,
  })
}

export function useVulnerabilidad(id: number) {
  return useQuery({
    queryKey: claves.detalle(id),
    queryFn: () =>
      ejecutar(api.GET('/api/vulnerabilidades/{id}', { params: { path: { id } } })),
    retry: false,
  })
}

/** Tras cualquier transición se refrescan listados y detalle. */
function useInvalidarVulnerabilidades() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: claves.todo })
}

/** Crea la vulnerabilidad en estado ABIERTA. */
export function useRegistrarVulnerabilidad() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: (datos: DatosRegistrar) =>
      ejecutar(api.POST('/api/vulnerabilidades', { body: datos })),
    onSuccess: invalidar,
  })
}

/** ABIERTA → EN_MITIGACION. */
export function useIniciarMitigacion() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: (id: number) =>
      ejecutar(
        api.PATCH('/api/vulnerabilidades/{id}/iniciar-mitigacion', {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidar,
  })
}

/** EN_MITIGACION → MITIGADA. */
export function useMitigarVulnerabilidad() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosMitigar }) =>
      ejecutar(
        api.PATCH('/api/vulnerabilidades/{id}/mitigar', {
          params: { path: { id } },
          body: datos,
        }),
      ),
    onSuccess: invalidar,
  })
}

/** ABIERTA o EN_MITIGACION → ACEPTADA (solo admin). */
export function useAceptarRiesgo() {
  const invalidar = useInvalidarVulnerabilidades()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosAceptarRiesgo }) =>
      ejecutar(
        api.PATCH('/api/vulnerabilidades/{id}/aceptar-riesgo', {
          params: { path: { id } },
          body: datos,
        }),
      ),
    onSuccess: invalidar,
  })
}

/** Corrige los datos (solo mientras está pendiente). */
export function useEditarVulnerabilidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: components['schemas']['EditarVulnerabilidadDto'] }) =>
      ejecutar(api.PATCH('/api/vulnerabilidades/{id}', { params: { path: { id } }, body: datos })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.todo }),
  })
}

/**
 * Anular (eliminación lógica) o revertir la anulación. Solo admin. Nada se
 * borra: el registro queda marcado y deja de contar en los indicadores.
 */
export function useAnulacionVulnerabilidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, modo, motivo }: { id: number; modo: 'anular' | 'reversar'; motivo: string }) => {
      const opciones = { params: { path: { id } }, body: { motivo } }
      return modo === 'anular'
        ? ejecutar(api.POST('/api/vulnerabilidades/{id}/anular', opciones))
        : ejecutar(api.POST('/api/vulnerabilidades/{id}/reversar', opciones))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.todo })
      void queryClient.invalidateQueries({ queryKey: ['trazas'] })
    },
  })
}

/** Indicadores del período (los anulados no cuentan). */
export function useIndicadoresVulnerabilidad(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...claves.todo, 'indicadores', desde, hasta],
    queryFn: () =>
      ejecutar(api.GET('/api/vulnerabilidades/indicadores', { params: { query: { desde, hasta } } })),
    placeholderData: keepPreviousData,
  })
}
