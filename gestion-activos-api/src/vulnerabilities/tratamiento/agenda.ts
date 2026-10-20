import type { Capa, EstadoEvento, EventoAgendaDto } from '../../common/dto/agenda.dto.js';
import type { ActivoBreveDto } from '../../common/dto/registro.dto.js';

/**
 * Agenda de vulnerabilidades en sus tres capas. Función pura. La DETECCIÓN
 * (real) nunca se confunde con el LÍMITE DE REMEDIACIÓN (previsto):
 *   1 Identificación y planificación: detección, tratamiento previsto y límite.
 *   2 Tratamiento: lo pendiente hasta el límite, el inicio real y cada acción.
 *   3 Verificación: la ventana prevista y las verificaciones hechas.
 */

export interface VulnerabilidadAgenda {
  id: number;
  cve: string | null;
  estado: 'ABIERTA' | 'EN_MITIGACION' | 'MITIGADA' | 'ACEPTADA';
  nivelRiesgo: string;
  fecha: Date;
  fechaLimite: Date | null;
  tratamientoPrevisto: Date | null;
  tratamientoIniciadoEn: Date | null;
  verificacionPrevista: Date | null;
  verificacionLimite: Date | null;
  responsable: string | null;
  activo: ActivoBreveDto;
}
export interface AccionAgenda {
  id: number;
  vulnerabilidadId: number;
  fecha: Date;
  descripcion: string;
  responsable: string;
  fueraDePlazo: boolean;
  activo: ActivoBreveDto;
}
export interface VerificacionVulAgenda {
  id: number;
  vulnerabilidadId: number;
  fecha: Date;
  resultado: 'CORREGIDA' | 'PERSISTE';
  responsable: string;
  fueraDePlazo: boolean;
  activo: ActivoBreveDto;
}

const nombre = (v: { id: number; cve: string | null }) => v.cve ?? `Vulnerabilidad #${v.id}`;
const abierta = (estado: string) => estado === 'ABIERTA' || estado === 'EN_MITIGACION';

export function agendaVulnerabilidades(d: {
  vulnerabilidades: VulnerabilidadAgenda[];
  acciones: AccionAgenda[];
  verificaciones: VerificacionVulAgenda[];
  desde: Date;
  hasta: Date;
  ahora: Date;
  capa?: Capa;
}): EventoAgendaDto[] {
  const quiere = (c: Capa) => !d.capa || d.capa === c;
  const eventos: EventoAgendaDto[] = [];
  const pendiente = (fin: Date | null): EstadoEvento => (fin && fin < d.ahora ? 'VENCIDO' : 'PROGRAMADO');

  for (const v of d.vulnerabilidades) {
    const base = { modulo: 'vulnerabilidades' as const, activo: v.activo, responsable: v.responsable, fueraDePlazo: false, ruta: `/vulnerabilidades/${v.id}` };
    const detalle = `Riesgo ${v.nivelRiesgo.toLowerCase()}`;
    const cerrada: EstadoEvento = v.estado === 'ACEPTADA' ? 'CANCELADO' : 'COMPLETADO';
    if (quiere(1)) {
      eventos.push({ ...base, clave: `v1d-${v.id}`, capa: 1, tipo: 'REAL', titulo: `Detectada: ${nombre(v)}`, inicio: v.fecha, fin: null, estado: 'COMPLETADO', detalle });
      if (v.tratamientoPrevisto) {
        const estado = v.tratamientoIniciadoEn ? 'COMPLETADO' : abierta(v.estado) ? pendiente(v.fechaLimite) : cerrada;
        eventos.push({ ...base, clave: `v1t-${v.id}`, capa: 1, tipo: 'PREVISTO', titulo: `Tratamiento previsto: ${nombre(v)}`, inicio: v.tratamientoPrevisto, fin: v.fechaLimite, estado, detalle });
      }
      if (v.fechaLimite) {
        eventos.push({ ...base, clave: `v1l-${v.id}`, capa: 1, tipo: 'PREVISTO', titulo: `Límite de remediación: ${nombre(v)}`, inicio: v.fechaLimite, fin: null, estado: abierta(v.estado) ? pendiente(v.fechaLimite) : cerrada, detalle });
      }
    }
    if (quiere(2)) {
      if (abierta(v.estado)) {
        const inicio = v.tratamientoIniciadoEn ?? v.tratamientoPrevisto ?? v.fecha;
        const estado = v.fechaLimite && v.fechaLimite < d.ahora ? 'VENCIDO' : v.tratamientoIniciadoEn ? 'EN_CURSO' : 'PROGRAMADO';
        eventos.push({ ...base, clave: `v2p-${v.id}`, capa: 2, tipo: 'PREVISTO', titulo: `Remediar: ${nombre(v)}`, inicio, fin: v.fechaLimite, estado, detalle });
      }
      if (v.tratamientoIniciadoEn) {
        eventos.push({ ...base, clave: `v2i-${v.id}`, capa: 2, tipo: 'REAL', titulo: `Tratamiento iniciado: ${nombre(v)}`, inicio: v.tratamientoIniciadoEn, fin: null, estado: 'COMPLETADO', detalle });
      }
    }
    if (quiere(3) && v.verificacionPrevista && v.estado === 'EN_MITIGACION') {
      eventos.push({ ...base, clave: `v3p-${v.id}`, capa: 3, tipo: 'PREVISTO', titulo: `Verificar: ${nombre(v)}`, inicio: v.verificacionPrevista, fin: v.verificacionLimite, estado: pendiente(v.verificacionLimite), detalle });
    }
  }

  const porId = new Map(d.vulnerabilidades.map((v) => [v.id, v]));
  if (quiere(2)) {
    for (const a of d.acciones) {
      const v = porId.get(a.vulnerabilidadId);
      eventos.push({ modulo: 'vulnerabilidades', clave: `v2a-${a.id}`, capa: 2, tipo: 'REAL', titulo: `Acción correctiva: ${v ? nombre(v) : `#${a.vulnerabilidadId}`}`, inicio: a.fecha, fin: null, estado: 'COMPLETADO', fueraDePlazo: a.fueraDePlazo, responsable: a.responsable, activo: a.activo, ruta: `/vulnerabilidades/${a.vulnerabilidadId}`, detalle: a.descripcion.slice(0, 120) });
    }
  }
  if (quiere(3)) {
    for (const x of d.verificaciones) {
      const v = porId.get(x.vulnerabilidadId);
      eventos.push({ modulo: 'vulnerabilidades', clave: `v3r-${x.id}`, capa: 3, tipo: 'REAL', titulo: `Verificación ${x.resultado === 'CORREGIDA' ? 'corregida' : 'persiste'}: ${v ? nombre(v) : `#${x.vulnerabilidadId}`}`, inicio: x.fecha, fin: null, estado: x.resultado === 'CORREGIDA' ? 'COMPLETADO' : 'FALLIDO', fueraDePlazo: x.fueraDePlazo, responsable: x.responsable, activo: x.activo, ruta: `/vulnerabilidades/${x.vulnerabilidadId}`, detalle: null });
    }
  }

  return eventos
    .filter((e) => e.inicio <= d.hasta && (e.fin ?? e.inicio) >= d.desde)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
