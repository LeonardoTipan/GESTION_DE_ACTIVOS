import type {
  EstadoVulnerabilidad,
  NivelRiesgo,
  Vulnerabilidad,
} from './api/vulnerabilidades.ts'

type Info = { etiqueta: string; color: string }

/** Misma escala de colores que la criticidad de los activos (verde → rojo). */
export const INFO_NIVEL: Record<NivelRiesgo, Info> = {
  BAJO: { etiqueta: 'Bajo', color: 'green' },
  MEDIO: { etiqueta: 'Medio', color: 'yellow' },
  ALTO: { etiqueta: 'Alto', color: 'orange' },
  CRITICO: { etiqueta: 'Crítico', color: 'red' },
}

export const INFO_ESTADO: Record<EstadoVulnerabilidad, Info> = {
  ABIERTA: { etiqueta: 'Abierta', color: 'red' },
  EN_MITIGACION: { etiqueta: 'En mitigación', color: 'yellow' },
  MITIGADA: { etiqueta: 'Mitigada', color: 'green' },
  ACEPTADA: { etiqueta: 'Riesgo aceptado', color: 'grape' },
}

/** De mayor a menor riesgo, como las ordena la API. */
export const NIVELES: NivelRiesgo[] = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO']
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoVulnerabilidad[]
export const ESTADOS_PENDIENTES: EstadoVulnerabilidad[] = ['ABIERTA', 'EN_MITIGACION']
export const ESTADOS_CERRADOS: EstadoVulnerabilidad[] = ['MITIGADA', 'ACEPTADA']

/** Formato oficial (el mismo que valida la API). */
export const FORMATO_CVE = /^CVE-\d{4}-\d{4,}$/

export type Accion = 'iniciar-mitigacion' | 'mitigar' | 'aceptar-riesgo'

/** Transiciones que permite cada estado (las mismas que valida la API). */
export function accionesPermitidas(estado: EstadoVulnerabilidad): Accion[] {
  switch (estado) {
    case 'ABIERTA':
      return ['iniciar-mitigacion', 'aceptar-riesgo']
    case 'EN_MITIGACION':
      return ['mitigar', 'aceptar-riesgo']
    default:
      return []
  }
}

// ── Semáforo del plazo (SLA) ────────────────────────────────────────────────

/** Días antes de la fecha límite en que el semáforo pasa a amarillo. */
export const DIAS_AVISO_SLA = 3
const MS_DIA = 24 * 60 * 60 * 1000

export type Semaforo = {
  tipo: 'vencida' | 'por-vencer' | 'en-plazo' | 'sin-plazo' | 'cerrada-en-plazo' | 'cerrada-fuera'
  color: string
  etiqueta: string
}

/**
 * Estado del plazo de remediación:
 * - Pendiente: rojo si ya venció, amarillo si vence en ≤ DIAS_AVISO_SLA días, verde si no.
 * - Cerrada: si se cerró antes o después de la fecha límite (útil para auditoría).
 */
export function semaforoSla(
  v: Pick<Vulnerabilidad, 'estado' | 'fechaLimite' | 'fechaCierre'>,
  ahora: Date = new Date(),
): Semaforo {
  const pendiente = ESTADOS_PENDIENTES.includes(v.estado)
  if (!v.fechaLimite) {
    return { tipo: 'sin-plazo', color: 'gray', etiqueta: pendiente ? 'Sin plazo' : 'Cerrada' }
  }
  const limite = new Date(v.fechaLimite).getTime()

  if (!pendiente) {
    const cierre = v.fechaCierre ? new Date(v.fechaCierre).getTime() : limite
    return cierre <= limite
      ? { tipo: 'cerrada-en-plazo', color: 'green', etiqueta: 'Cerrada en plazo' }
      : { tipo: 'cerrada-fuera', color: 'red', etiqueta: 'Cerrada fuera de plazo' }
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

// ── Pasos del Stepper ───────────────────────────────────────────────────────

export type Paso = { clave: 'abierta' | 'mitigacion' | 'mitigada' | 'aceptada'; hecho: boolean }

/**
 * Ciclo ABIERTA → EN_MITIGACION → MITIGADA. Si se aceptó el riesgo, el ciclo
 * termina en "Riesgo aceptado" (la BD no guarda si pasó antes por mitigación,
 * así que no se inventa ese paso).
 */
export function pasosCiclo(estado: EstadoVulnerabilidad): Paso[] {
  if (estado === 'ACEPTADA') {
    return [
      { clave: 'abierta', hecho: true },
      { clave: 'aceptada', hecho: true },
    ]
  }
  const orden: EstadoVulnerabilidad[] = ['ABIERTA', 'EN_MITIGACION', 'MITIGADA']
  const alcanzado = orden.indexOf(estado)
  return [
    { clave: 'abierta', hecho: true },
    { clave: 'mitigacion', hecho: alcanzado >= 1 },
    { clave: 'mitigada', hecho: alcanzado >= 2 },
  ]
}

/** Paso "activo" del Stepper: el primero sin hacer (o todos). */
export function pasoActivo(pasos: readonly Paso[]): number {
  const i = pasos.findIndex((p) => !p.hecho)
  return i === -1 ? pasos.length : i
}
