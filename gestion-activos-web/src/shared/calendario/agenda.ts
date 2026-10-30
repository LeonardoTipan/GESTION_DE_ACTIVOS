import type { Dayjs } from 'dayjs'
import type { components } from '../../api/schema'

import { enZona } from '../zona.ts'
/**
 * Lógica pura de los calendarios: rangos de cada vista y qué eventos tocan
 * cada día. Las fechas se muestran y agrupan por día en la hora de la
 * institución (shared/zona.ts), sea cual sea la del equipo; la API las guarda en UTC.
 */

export type EventoAgenda = components['schemas']['EventoAgendaDto']
export type EstadoEvento = EventoAgenda['estado']
export type Modulo = EventoAgenda['modulo']
export type Capa = EventoAgenda['capa']
export type Vista = 'mes' | 'semana' | 'dia'

export const ASPECTO_ESTADO: Record<EstadoEvento, { etiqueta: string; color: string }> = {
  PROGRAMADO: { etiqueta: 'Programado', color: 'blue' },
  EN_CURSO: { etiqueta: 'En curso', color: 'yellow' },
  VENCIDO: { etiqueta: 'Vencido', color: 'red' },
  COMPLETADO: { etiqueta: 'Completado', color: 'green' },
  FALLIDO: { etiqueta: 'Fallido o no satisfactorio', color: 'orange' },
  CANCELADO: { etiqueta: 'Cancelado', color: 'gray' },
}
export const ESTADOS = Object.keys(ASPECTO_ESTADO) as EstadoEvento[]

export const NOMBRE_MODULO: Record<Modulo, string> = {
  respaldos: 'Respaldos',
  mantenimientos: 'Mantenimientos',
  vulnerabilidades: 'Vulnerabilidades',
  renovaciones: 'Renovaciones',
  endpoints: 'Protección de Endpoints',
  evaluaciones: 'Evaluación de Sistemas',
}

/**
 * Nombre de cada capa en cada módulo. Mantenimientos y vulnerabilidades tienen solo
 * dos fases: su capa 3 no tiene eventos.
 */
export const NOMBRE_CAPA: Record<Modulo, Record<Capa, string>> = {
  respaldos: { 1: 'Planificación', 2: 'Ejecución', 3: 'Restauración' },
  mantenimientos: { 1: 'Planificación', 2: 'Ejecución', 3: '—' },
  vulnerabilidades: { 1: 'Detección', 2: 'Remediación', 3: '—' },
  renovaciones: { 1: 'Planificación y caducidad', 2: 'Renovación real', 3: '—' },
  endpoints: { 1: 'Período mensual', 2: 'Medición real', 3: '—' },
  evaluaciones: { 1: 'Paso a producción programado', 2: 'Pruebas reales', 3: '—' },
}

/** La semana empieza el lunes. */
export function inicioSemana(d: Dayjs): Dayjs {
  return d.startOf('day').subtract((d.day() + 6) % 7, 'day')
}

/** Primer y último día (incluido) que muestra cada vista. */
export function rangoDe(vista: Vista, ancla: Dayjs): { desde: Dayjs; hasta: Dayjs } {
  if (vista === 'dia') return { desde: ancla.startOf('day'), hasta: ancla.endOf('day') }
  if (vista === 'semana') {
    const desde = inicioSemana(ancla)
    return { desde, hasta: desde.add(6, 'day').endOf('day') }
  }
  const desde = inicioSemana(ancla.startOf('month'))
  const hasta = inicioSemana(ancla.endOf('month')).add(6, 'day').endOf('day')
  return { desde, hasta }
}

export function moverAncla(vista: Vista, ancla: Dayjs, paso: 1 | -1): Dayjs {
  return ancla.add(paso, vista === 'mes' ? 'month' : vista === 'semana' ? 'week' : 'day')
}

export function diasDe(desde: Dayjs, hasta: Dayjs): Dayjs[] {
  const dias: Dayjs[] = []
  for (let d = desde.startOf('day'); !d.isAfter(hasta, 'day'); d = d.add(1, 'day')) dias.push(d)
  return dias
}

/**
 * Cómo aparece un evento en un día: 'unico' (empieza y termina ese día o es
 * un instante), 'inicio' y 'limite' (los dos extremos de un intervalo) o
 * 'continua' (un día intermedio; solo en la vista diaria).
 */
export type Rol = 'unico' | 'inicio' | 'limite' | 'continua'
export interface Marca {
  evento: EventoAgenda
  rol: Rol
  /** La hora que se muestra ese día. */
  hora: Dayjs
}

export function marcasDelDia(eventos: EventoAgenda[], dia: Dayjs, incluirContinuas = false): Marca[] {
  const marcas: Marca[] = []
  for (const evento of eventos) {
    const inicio = enZona(evento.inicio)
    const fin = evento.fin ? enZona(evento.fin) : null
    if (!fin || fin.isSame(inicio, 'day')) {
      if (inicio.isSame(dia, 'day')) marcas.push({ evento, rol: 'unico', hora: inicio })
    } else if (inicio.isSame(dia, 'day')) {
      marcas.push({ evento, rol: 'inicio', hora: inicio })
    } else if (fin.isSame(dia, 'day')) {
      marcas.push({ evento, rol: 'limite', hora: fin })
    } else if (incluirContinuas && dia.isAfter(inicio, 'day') && dia.isBefore(fin, 'day')) {
      marcas.push({ evento, rol: 'continua', hora: dia.startOf('day') })
    }
  }
  return marcas.sort((a, b) => a.hora.valueOf() - b.hora.valueOf())
}

/** Etiqueta de los extremos: un evento PREVISTO tiene inicio previsto y límite; uno REAL, inicio y fin reales. */
export function textoRol(evento: EventoAgenda, rol: Rol): string {
  const previsto = evento.tipo === 'PREVISTO'
  switch (rol) {
    case 'inicio':
      return previsto ? 'Inicio previsto' : 'Inicio real'
    case 'limite':
      return previsto ? 'Límite' : 'Fin real'
    case 'continua':
      return previsto ? 'En plazo' : 'En curso'
    default:
      return previsto ? 'Previsto' : 'Real'
  }
}
