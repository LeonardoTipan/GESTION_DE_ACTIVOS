import type {
  EstadoVulnerabilidad,
  Fuente,
  NivelRiesgo,
  Prioridad,
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
  EN_MITIGACION: { etiqueta: 'En tratamiento', color: 'yellow' },
  MITIGADA: { etiqueta: 'Mitigada', color: 'green' },
  ACEPTADA: { etiqueta: 'Riesgo aceptado', color: 'grape' },
}

/** De mayor a menor riesgo, como las ordena la API. */
export const NIVELES: NivelRiesgo[] = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO']
export const ESTADOS = Object.keys(INFO_ESTADO) as EstadoVulnerabilidad[]
export const ESTADOS_PENDIENTES: EstadoVulnerabilidad[] = ['ABIERTA', 'EN_MITIGACION']
export const ESTADOS_CERRADOS: EstadoVulnerabilidad[] = ['MITIGADA', 'ACEPTADA']

/** De dónde viene el hallazgo. Se registra a mano: no hay escáner conectado. */
export const INFO_FUENTE: Record<Fuente, string> = {
  MANUAL: 'Registro manual',
  ESCANEO: 'Escaneo (informe externo)',
  AUDITORIA: 'Auditoría',
  BOLETIN_PROVEEDOR: 'Boletín del proveedor',
  PRUEBA_PENETRACION: 'Prueba de penetración',
  REPORTE_USUARIO: 'Reporte de usuario',
}
export const FUENTES = Object.keys(INFO_FUENTE) as Fuente[]

export const INFO_PRIORIDAD: Record<Prioridad, Info> = {
  P1: { etiqueta: 'P1 · inmediata', color: 'red' },
  P2: { etiqueta: 'P2 · alta', color: 'orange' },
  P3: { etiqueta: 'P3 · media', color: 'yellow' },
  P4: { etiqueta: 'P4 · baja', color: 'gray' },
}
export const PRIORIDADES = Object.keys(INFO_PRIORIDAD) as Prioridad[]

/** Formato oficial (el mismo que valida la API). */
export const FORMATO_CVE = /^CVE-\d{4}-\d{4,}$/

export type Accion =
  | 'confirmar'
  | 'evaluar'
  | 'iniciar-mitigacion'
  | 'registrar-accion'
  | 'verificar'
  | 'aceptar-riesgo'

type Ciclo = Pick<Vulnerabilidad, 'estado' | 'confirmadaEn' | 'evaluadaEn'>

/**
 * Lo que admite cada etapa (las mismas reglas que valida la API):
 * detectada → confirmar · confirmada → evaluar · evaluada → iniciar el tratamiento ·
 * en tratamiento → acciones, reevaluar y verificar · cerrada (mitigada) → solo
 * una verificación que detecte que persiste, que la reabre.
 */
export function accionesPermitidas(v: Ciclo): Accion[] {
  switch (v.estado) {
    case 'ABIERTA':
      return [
        !v.confirmadaEn ? 'confirmar' : 'evaluar',
        ...(v.evaluadaEn ? (['iniciar-mitigacion'] as const) : []),
        'aceptar-riesgo',
      ]
    case 'EN_MITIGACION':
      return ['registrar-accion', 'verificar', 'evaluar', 'aceptar-riesgo']
    case 'MITIGADA':
      return ['verificar']
    default:
      return []
  }
}

/** Se corrigen los datos de identificación mientras está pendiente. */
export const admiteEdicion = (estado: EstadoVulnerabilidad) => ESTADOS_PENDIENTES.includes(estado)

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

export type Paso = {
  clave: 'detectada' | 'confirmada' | 'evaluada' | 'tratamiento' | 'cerrada' | 'aceptada'
  hecho: boolean
}

/**
 * Ciclo de tres capas: detectada → confirmada → evaluada → en tratamiento →
 * cerrada por verificación. Si se aceptó el riesgo, termina en "Riesgo aceptado"
 * con los pasos que realmente se dieron (no se inventan).
 */
export function pasosCiclo(v: Ciclo): Paso[] {
  const confirmada = v.confirmadaEn !== null
  const evaluada = v.evaluadaEn !== null
  if (v.estado === 'ACEPTADA') {
    return [
      { clave: 'detectada', hecho: true },
      ...(confirmada ? [{ clave: 'confirmada' as const, hecho: true }] : []),
      ...(evaluada ? [{ clave: 'evaluada' as const, hecho: true }] : []),
      { clave: 'aceptada', hecho: true },
    ]
  }
  const enTratamiento = v.estado === 'EN_MITIGACION' || v.estado === 'MITIGADA'
  return [
    { clave: 'detectada', hecho: true },
    { clave: 'confirmada', hecho: confirmada },
    { clave: 'evaluada', hecho: evaluada },
    { clave: 'tratamiento', hecho: enTratamiento },
    { clave: 'cerrada', hecho: v.estado === 'MITIGADA' },
  ]
}

/** Paso "activo" del Stepper: el primero sin hacer (o todos). */
export function pasoActivo(pasos: readonly Paso[]): number {
  const i = pasos.findIndex((p) => !p.hecho)
  return i === -1 ? pasos.length : i
}
