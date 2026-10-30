import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { ejecutar } from '../api/errores.ts'
import type { Capa, EstadoEvento, EventoAgenda, Modulo } from './agenda.ts'

export interface FiltrosAgenda {
  desde: string
  hasta: string
  capa?: Capa
  categoriaId?: number
  responsable?: string
  estado?: EstadoEvento
}

/** Raíz de las claves de caché: los módulos la invalidan tras cada cambio. */
export const CLAVE_AGENDA = ['agenda'] as const

function agendaDe(modulo: Modulo, query: FiltrosAgenda): Promise<EventoAgenda[]> {
  switch (modulo) {
    case 'respaldos':
      return ejecutar(api.GET('/api/respaldos/agenda', { params: { query } }))
    case 'mantenimientos':
      return ejecutar(api.GET('/api/mantenimientos/agenda', { params: { query } }))
    case 'vulnerabilidades':
      return ejecutar(api.GET('/api/vulnerabilidades/agenda', { params: { query } }))
    case 'renovaciones':
      return ejecutar(api.GET('/api/renovaciones/agenda', { params: { query } }))
    case 'endpoints':
      return ejecutar(api.GET('/api/proteccion-endpoints/periodos/agenda', { params: { query } }))
    case 'evaluaciones':
      return ejecutar(api.GET('/api/evaluaciones-sistemas/agenda', { params: { query } }))
  }
}

/** Eventos de uno o varios módulos (la vista general del proyecto los junta). */
export function useAgenda(modulos: Modulo[], filtros: FiltrosAgenda) {
  return useQuery({
    queryKey: [...CLAVE_AGENDA, modulos, filtros],
    queryFn: async () => {
      const listas = await Promise.all(modulos.map((m) => agendaDe(m, filtros)))
      return listas.flat().sort((a, b) => a.inicio.localeCompare(b.inicio))
    },
    placeholderData: keepPreviousData,
  })
}
