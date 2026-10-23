import type { EstadoVulnerabilidad, NivelRiesgo, Vulnerabilidad } from './api/vulnerabilidades.ts'

type Info = { etiqueta: string; color: string }

/** «Criticidad»: misma escala de colores que la criticidad de los activos (verde → rojo). */
export const INFO_NIVEL: Record<NivelRiesgo, Info> = {
  BAJO: { etiqueta: 'Baja', color: 'green' },
  MEDIO: { etiqueta: 'Media', color: 'yellow' },
  ALTO: { etiqueta: 'Alta', color: 'orange' },
  CRITICO: { etiqueta: 'Crítica', color: 'red' },
}

/** «Estado» (fase de Remediación): distinto de la criticidad. */
export const INFO_ESTADO: Record<EstadoVulnerabilidad, Info> = {
  ABIERTO: { etiqueta: 'Abierto', color: 'red' },
  EN_PROGRESO: { etiqueta: 'En progreso', color: 'yellow' },
  REMEDIADO: { etiqueta: 'Remediado', color: 'green' },
}

/** De mayor a menor criticidad, como las ordena la API. */
export const NIVELES: NivelRiesgo[] = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO']
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoVulnerabilidad[]
export const ESTADOS_PENDIENTES: EstadoVulnerabilidad[] = ['ABIERTO', 'EN_PROGRESO']

/** Formato oficial (el mismo que valida la API). */
export const FORMATO_CVE = /^CVE-\d{4}-\d{4,}$/

export type Accion = 'iniciar' | 'remediar' | 'reabrir'

/**
 * Lo que admite cada estado (las mismas transiciones que valida la API):
 * ABIERTO → iniciar o remediar · EN_PROGRESO → remediar · REMEDIADO → reabrir.
 */
export function accionesPermitidas(estado: EstadoVulnerabilidad): Accion[] {
  switch (estado) {
    case 'ABIERTO':
      return ['iniciar', 'remediar']
    case 'EN_PROGRESO':
      return ['remediar']
    case 'REMEDIADO':
      return ['reabrir']
  }
}

/** Los datos de Detección se corrigen mientras está pendiente. */
export const admiteEdicion = (estado: EstadoVulnerabilidad) => ESTADOS_PENDIENTES.includes(estado)

/** Lo que falta para poder remediar (para avisar antes de enviar; la API lo exige igual). */
export function faltantesParaRemediar(d: {
  fechaRemediacion: string | null
  evidencia: string
  repositorioVerificable: string
}): string[] {
  return [
    !d.fechaRemediacion && 'la fecha de remediación',
    !d.evidencia.trim() && 'el verificable',
    !d.repositorioVerificable.trim() && 'el repositorio del verificable',
  ].filter((x): x is string => Boolean(x))
}

// ── Semáforo del plazo ──────────────────────────────────────────────────────

/** Días antes de la fecha límite en que el semáforo pasa a amarillo. */
export const DIAS_AVISO_SLA = 3
const MS_DIA = 24 * 60 * 60 * 1000

export type Semaforo = {
  tipo: 'vencida' | 'por-vencer' | 'en-plazo' | 'sin-plazo' | 'remediada-en-plazo' | 'remediada-fuera'
  color: string
  etiqueta: string
}

/**
 * Estado del plazo de remediación:
 * - Pendiente: rojo si ya venció, amarillo si vence en ≤ DIAS_AVISO_SLA días, verde si no.
 * - Remediada: si la fecha REAL de remediación cayó antes o después del plazo.
 */
export function semaforoSla(
  v: Pick<Vulnerabilidad, 'estado' | 'fechaLimite' | 'fechaRemediacion'>,
  ahora: Date = new Date(),
): Semaforo {
  const pendiente = ESTADOS_PENDIENTES.includes(v.estado)
  if (!v.fechaLimite) {
    return { tipo: 'sin-plazo', color: 'gray', etiqueta: 'Sin plazo' }
  }
  const limite = new Date(v.fechaLimite).getTime()

  if (!pendiente) {
    const remediacion = v.fechaRemediacion ? new Date(v.fechaRemediacion).getTime() : limite
    return remediacion <= limite
      ? { tipo: 'remediada-en-plazo', color: 'green', etiqueta: 'Remediada en plazo' }
      : { tipo: 'remediada-fuera', color: 'red', etiqueta: 'Remediada fuera de plazo' }
  }

  const restante = limite - ahora.getTime()
  const dias = Math.ceil(Math.abs(restante) / MS_DIA)
  if (restante < 0) {
    return { tipo: 'vencida', color: 'red', etiqueta: `Vencida hace ${dias} d` }
  }
  if (restante <= DIAS_AVISO_SLA * MS_DIA) {
    return { tipo: 'por-vencer', color: 'yellow', etiqueta: `Vence en ${dias} d` }
  }
  return { tipo: 'en-plazo', color: 'green', etiqueta: `En plazo · ${dias} d` }
}
