import type { Cambios } from '../inventory/bitacora/cambios.js';
import { MOTIVO_INACTIVO, type MotivoInactivo, type CambioBaja } from './plan.js';

export const TIPOS_NOTIFICACION = [
  'ALTA',
  'MODIFICACION',
  'CAMBIO_ESTADO',
  'BAJA_DETECTADA',
  'REACTIVACION',
  'ERROR_SINCRONIZACION',
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export interface NotificacionNueva {
  tipo: TipoNotificacion;
  titulo: string;
  /** Cambios { campo: { antes, despues } }; en los errores, { mensaje }. */
  detalle: Cambios | { mensaje: string };
}

export const TEXTO_MOTIVO: Record<MotivoInactivo, string> = {
  [MOTIVO_INACTIVO.PAPELERA]: 'está en la papelera de GLPI',
  [MOTIVO_INACTIVO.AUSENTE]: 'ya no existe en GLPI',
};

const corto = (texto: string): string =>
  texto.length <= 191 ? texto : `${texto.slice(0, 190)}…`;

/**
 * Aviso que corresponde a un cambio YA ESCRITO en un activo. Función pura.
 * Solo se llama cuando hubo un cambio real: si GLPI no trae diferencias no hay
 * escritura y, por tanto, tampoco aviso (así nunca se repiten).
 */
export function notificacionDeCambio(cambio: {
  codigo: string;
  nombre: string;
  accion: 'CREAR' | 'ENLAZAR' | 'ACTUALIZAR';
  baja?: CambioBaja;
  motivo?: MotivoInactivo;
  cambios: Cambios;
}): NotificacionNueva {
  const quien = `${cambio.codigo} · ${cambio.nombre}`;
  const { cambios: detalle } = cambio;
  if (cambio.baja === 'INACTIVAR') {
    return {
      tipo: 'BAJA_DETECTADA',
      titulo: corto(
        `${quien} se dio de baja: ${TEXTO_MOTIVO[cambio.motivo ?? MOTIVO_INACTIVO.AUSENTE]}`,
      ),
      detalle,
    };
  }
  if (cambio.baja === 'REACTIVAR') {
    return {
      tipo: 'REACTIVACION',
      titulo: corto(`${quien} vuelve a estar vigente en GLPI`),
      detalle,
    };
  }
  if (cambio.accion === 'CREAR') {
    return {
      tipo: 'ALTA',
      titulo: corto(`Nuevo activo desde GLPI: ${quien}`),
      detalle,
    };
  }
  if (cambio.accion === 'ENLAZAR') {
    return {
      tipo: 'MODIFICACION',
      titulo: corto(`${quien} se vinculó con su elemento de GLPI`),
      detalle,
    };
  }
  if (detalle.estado) {
    const { antes, despues } = detalle.estado;
    return {
      tipo: 'CAMBIO_ESTADO',
      titulo: corto(
        `${quien}: estado ${String(antes ?? 'sin estado')} → ${String(despues ?? 'sin estado')}`,
      ),
      detalle,
    };
  }
  const campos = Object.keys(detalle);
  return {
    tipo: 'MODIFICACION',
    titulo: corto(
      `${quien}: GLPI modificó ${campos.length === 1 ? campos[0] : `${campos.length} campos`}`,
    ),
    detalle,
  };
}
