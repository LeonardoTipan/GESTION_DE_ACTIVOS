import { formatearFechaHora } from '../../shared/formato.ts'
import type {
  EstadoSincronizacion,
  Notificacion,
  ResultadoSincronizacion,
} from './api/sincronizacion.ts'

type Contadores = ResultadoSincronizacion['contadores']

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Lo que se muestra al terminar una sincronización. */
export interface ResumenSincronizacion {
  color: 'green' | 'orange' | 'red'
  titulo: string
  /** Una línea por tipo de resultado, solo las que tienen algo que contar. */
  lineas: string[]
}

/** "1 nuevo, 2 actualizados…": solo lo que ocurrió. */
export function lineasDeContadores(c: Contadores): string[] {
  const lineas: string[] = []
  if (c.creados) lineas.push(plural(c.creados, 'activo nuevo', 'activos nuevos'))
  if (c.actualizados) lineas.push(plural(c.actualizados, 'actualizado', 'actualizados'))
  if (c.inactivados) lineas.push(plural(c.inactivados, 'dado de baja', 'dados de baja'))
  if (c.reactivados) lineas.push(plural(c.reactivados, 'reactivado', 'reactivados'))
  if (c.sinCambios) lineas.push(`${c.sinCambios} sin cambios`)
  if (c.omitidos) lineas.push(plural(c.omitidos, 'omitido', 'omitidos'))
  if (c.porRevisar) lineas.push(`${c.porRevisar} para revisión manual`)
  if (c.errores) lineas.push(plural(c.errores, 'error', 'errores'))
  return lineas
}

export function resumenSincronizacion(r: ResultadoSincronizacion): ResumenSincronizacion {
  const { contadores: c } = r
  const lineas = lineasDeContadores(c)
  // Detectado y no aplicado: lo que quedó pendiente.
  if (c.detectados !== c.aplicados) {
    lineas.push(`${c.aplicados} de ${c.detectados} cambios detectados se aplicaron`)
  }
  if (r.estado === 'EXITOSA') {
    return {
      color: 'green',
      titulo:
        c.aplicados === 0
          ? 'El inventario ya estaba al día'
          : `Sincronización completada: ${plural(c.aplicados, 'cambio aplicado', 'cambios aplicados')}`,
      lineas,
    }
  }
  return {
    color: r.estado === 'FALLIDA' ? 'red' : 'orange',
    titulo:
      r.estado === 'FALLIDA'
        ? 'No se pudo sincronizar con GLPI'
        : 'Sincronización terminada con errores',
    lineas: [
      ...lineas,
      'Lo pendiente se reintentará en la próxima sincronización: no se pierde ningún cambio.',
    ],
  }
}

/** Texto bajo el botón: cuándo fue la última sincronización sin errores. */
export function textoUltimaSincronizacion(estado: EstadoSincronizacion | undefined): string {
  if (!estado) return ''
  if (!estado.configurado) return 'GLPI no está configurado en el servidor'
  if (estado.enCurso) return 'Hay una sincronización en curso…'
  if (!estado.ultimaExitosa) return 'Aún no se ha sincronizado con GLPI'
  const aviso =
    estado.ultima && estado.ultima.estado !== 'EXITOSA' && estado.ultima.estado !== 'EN_CURSO'
      ? ' · el último intento falló'
      : ''
  return `Última sincronización: ${formatearFechaHora(estado.ultimaExitosa)}${aviso}`
}

/** ¿Se puede pulsar el botón? */
export function puedeSincronizar(estado: EstadoSincronizacion | undefined): boolean {
  return Boolean(estado?.configurado) && !estado?.enCurso
}

export const ETIQUETA_RESULTADO: Record<string, string> = {
  CREAR: 'Nuevo',
  ENLAZAR: 'Vinculado',
  ACTUALIZAR: 'Actualizado',
  INACTIVAR: 'Dado de baja',
  REACTIVAR: 'Reactivado',
  OMITIR: 'Omitido',
  ERROR: 'Error',
}

export const COLOR_RESULTADO: Record<string, string> = {
  CREAR: 'green',
  ENLAZAR: 'teal',
  ACTUALIZAR: 'indigo',
  INACTIVAR: 'gray',
  REACTIVAR: 'green',
  OMITIR: 'yellow',
  ERROR: 'red',
}

export const ASPECTO_NOTIFICACION: Record<Notificacion['tipo'], { etiqueta: string; color: string }> = {
  ALTA: { etiqueta: 'Alta', color: 'green' },
  MODIFICACION: { etiqueta: 'Modificación', color: 'indigo' },
  CAMBIO_ESTADO: { etiqueta: 'Cambio de estado', color: 'orange' },
  BAJA_DETECTADA: { etiqueta: 'Baja detectada', color: 'gray' },
  REACTIVACION: { etiqueta: 'Reactivación', color: 'teal' },
  ERROR_SINCRONIZACION: { etiqueta: 'Error', color: 'red' },
  // Avisos de los módulos (no de GLPI): llevan un mensaje, no cambios de campos.
  RESPALDO_FALLIDO: { etiqueta: 'Respaldo fallido', color: 'red' },
  MANTENIMIENTO_NO_SATISFACTORIO: { etiqueta: 'Mantenimiento no satisfactorio', color: 'orange' },
  VULNERABILIDAD_CRITICA: { etiqueta: 'Vulnerabilidad crítica', color: 'red' },
  VULNERABILIDAD_REABIERTA: { etiqueta: 'Vulnerabilidad reabierta', color: 'orange' },
}

/** Avisos cuyo detalle es { mensaje } en lugar de cambios de campos. */
const CON_MENSAJE = new Set<Notificacion['tipo']>([
  'ERROR_SINCRONIZACION',
  'RESPALDO_FALLIDO',
  'MANTENIMIENTO_NO_SATISFACTORIO',
  'VULNERABILIDAD_CRITICA',
  'VULNERABILIDAD_REABIERTA',
])

/** Mensaje de un aviso de error o de un módulo ({ mensaje }); null en los avisos de cambios. */
export function mensajeDeAviso(aviso: Pick<Notificacion, 'tipo' | 'detalle'>): string | null {
  const { mensaje } = aviso.detalle as { mensaje?: unknown }
  return CON_MENSAJE.has(aviso.tipo) && typeof mensaje === 'string' ? mensaje : null
}
