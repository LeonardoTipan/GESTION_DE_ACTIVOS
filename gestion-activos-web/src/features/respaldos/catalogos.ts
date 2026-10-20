import type { components } from '../../api/schema'

type Plan = components['schemas']['PlanRespaldoDto']
type Restauracion = components['schemas']['RestauracionDto']

/** Textos de los catálogos, tal como aparecen en el prototipo. */
export const FRECUENCIA: Record<Plan['frecuencia'], string> = {
  DIARIO: 'Diario',
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
}

export const FRECUENCIA_PRUEBA: Record<Plan['frecuenciaPrueba'], string> = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
}

export const TIPO: Record<Plan['tipo'], string> = {
  COMPLETO: 'Completo',
  INCREMENTAL: 'Incremental',
  DIFERENCIAL: 'Diferencial',
  SNAPSHOT: 'Snapshot',
}

export const MEDIO: Record<Plan['medio'], string> = {
  DISCO_A_DISCO: 'Disco a disco (D2D)',
  CINTA_LTO8: 'Cinta LTO-8',
  NUBE_INMUTABLE: 'Nube con retención inmutable',
  NAS_SECUNDARIO: 'NAS secundario',
}

export const VENTANA: Record<Plan['ventana'], string> = {
  NOCTURNA_22_02: 'Nocturna 22:00–02:00',
  NOCTURNA_00_04: 'Nocturna 00:00–04:00',
  FIN_DE_SEMANA: 'Fin de semana',
  HORARIO_LABORAL: 'Horario laboral',
  CONTINUA: 'Continua (replicación)',
}

export const RETENCION: Record<Plan['retencion'], string> = {
  DIAS_30: '30 días',
  DIAS_90: '90 días',
  MESES_6: '6 meses',
  ANIO_1: '1 año',
  ANIOS_3: '3 años',
  ANIOS_7: '7 años',
}

export const ESTADO_PLAN: Record<Plan['estado'], string> = {
  VIGENTE: 'Vigente',
  SUSPENDIDO: 'Suspendido',
}

export const RESULTADO: Record<Restauracion['resultado'], string> = {
  EXITOSO: 'Exitoso',
  PARCIAL: 'Parcial',
  FALLIDO: 'Fallido',
}

export const COLOR_RESULTADO: Record<Restauracion['resultado'], string> = {
  EXITOSO: 'green',
  PARCIAL: 'yellow',
  FALLIDO: 'red',
}

export const MOTIVO_RESTAURACION: Record<Restauracion['motivo'], string> = {
  PRUEBA_PROGRAMADA: 'Prueba programada',
  INCIDENTE_DISPONIBILIDAD: 'Incidente de disponibilidad',
  SOLICITUD_PROPIETARIO: 'Solicitud del propietario',
  VERIFICACION_INTEGRIDAD: 'Verificación de integridad',
}

/** Opciones para un Select de Mantine a partir de un catálogo. */
export const opciones = <K extends string>(catalogo: Record<K, string>) =>
  (Object.entries(catalogo) as [K, string][]).map(([value, label]) => ({ value, label }))


/** Nombres de los campos, para las trazas. */
export const ETIQUETAS_RESPALDO: Record<string, string> = {
  frecuencia: 'Frecuencia',
  frecuenciaPrueba: 'Frecuencia de prueba',
  tipo: 'Tipo de respaldo',
  medio: 'Medio de almacenamiento',
  ventana: 'Ventana de ejecución',
  retencion: 'Período de retención',
  rpoHoras: 'RPO (h)',
  rtoMinutos: 'RTO (min)',
  responsable: 'Responsable',
  estado: 'Estado del plan',
  justificacion: 'Justificación',
  fecha: 'Fecha',
  volumenGb: 'Volumen (GB)',
  duracionMin: 'Duración (min)',
  resultado: 'Resultado',
  cifrado: 'Cifrado',
  fueraSitio: 'Copia fuera de sitio',
  inmutable: 'Retención inmutable',
  integridad: 'Integridad verificada',
  motivo: 'Motivo',
  tiempoRealMin: 'Tiempo real (min)',
  evidencia: 'Evidencia',
}

/** Esquema 3-2-1 del prototipo: controles visibles de una ejecución. */
export function controlesEjecucion(e: {
  cifrado: boolean
  fueraSitio: boolean
  inmutable: boolean
  integridad: boolean
}): string[] {
  return [
    e.cifrado && 'Cifrado',
    e.fueraSitio && 'Fuera de sitio',
    e.inmutable && 'Inmutable',
    e.integridad && 'Verificado',
  ].filter((x): x is string => Boolean(x))
}
