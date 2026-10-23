import type { Capa, EstadoEvento, EventoAgendaDto } from '../../common/dto/agenda.dto.js';
import type { ActivoBreveDto } from '../../common/dto/registro.dto.js';
import type { EstadoVulnerabilidad } from '../../generated/prisma/enums.js';
import { ESTADOS_ABIERTOS } from './transiciones.js';

/**
 * Agenda de vulnerabilidades en sus DOS fases. Función pura. La detección (real)
 * nunca se confunde con el plazo (previsto) ni con la remediación (real):
 *   1 Detección: cuándo se detectó y, si lo hay, el plazo de remediación.
 *   2 Remediación: lo pendiente hasta el plazo, el inicio real y la remediación real.
 * No hay capa de verificación: la capa 3 no devuelve eventos.
 */

export interface VulnerabilidadAgenda {
  id: number;
  cve: string | null;
  estado: EstadoVulnerabilidad;
  nivelRiesgo: string;
  fecha: Date;
  fechaLimite: Date | null;
  tratamientoIniciadoEn: Date | null;
  fechaRemediacion: Date | null;
  responsable: string | null;
  activo: ActivoBreveDto;
}

const nombre = (v: { id: number; cve: string | null }) => v.cve ?? `Vulnerabilidad #${v.id}`;

export function agendaVulnerabilidades(d: {
  vulnerabilidades: VulnerabilidadAgenda[];
  desde: Date;
  hasta: Date;
  ahora: Date;
  capa?: Capa;
}): EventoAgendaDto[] {
  const quiere = (c: Capa) => !d.capa || d.capa === c;
  const eventos: EventoAgendaDto[] = [];

  for (const v of d.vulnerabilidades) {
    const base = { modulo: 'vulnerabilidades' as const, activo: v.activo, responsable: v.responsable, fueraDePlazo: false, ruta: `/vulnerabilidades/${v.id}` };
    const detalle = `Criticidad ${v.nivelRiesgo.toLowerCase()}`;
    const pendiente = ESTADOS_ABIERTOS.includes(v.estado);
    const vencida = pendiente && v.fechaLimite !== null && v.fechaLimite < d.ahora;
    if (quiere(1)) {
      eventos.push({ ...base, clave: `v1d-${v.id}`, capa: 1, tipo: 'REAL', titulo: `Detectada: ${nombre(v)}`, inicio: v.fecha, fin: null, estado: 'COMPLETADO', detalle });
      if (v.fechaLimite) {
        const estado: EstadoEvento = pendiente ? (vencida ? 'VENCIDO' : 'PROGRAMADO') : 'COMPLETADO';
        eventos.push({ ...base, clave: `v1l-${v.id}`, capa: 1, tipo: 'PREVISTO', titulo: `Plazo de remediación: ${nombre(v)}`, inicio: v.fechaLimite, fin: null, estado, detalle });
      }
    }
    if (quiere(2)) {
      if (pendiente) {
        const estado: EstadoEvento = vencida ? 'VENCIDO' : v.estado === 'EN_PROGRESO' ? 'EN_CURSO' : 'PROGRAMADO';
        eventos.push({ ...base, clave: `v2p-${v.id}`, capa: 2, tipo: 'PREVISTO', titulo: `Remediar: ${nombre(v)}`, inicio: v.tratamientoIniciadoEn ?? v.fecha, fin: v.fechaLimite, estado, detalle });
      }
      if (v.tratamientoIniciadoEn) {
        eventos.push({ ...base, clave: `v2i-${v.id}`, capa: 2, tipo: 'REAL', titulo: `Remediación iniciada: ${nombre(v)}`, inicio: v.tratamientoIniciadoEn, fin: null, estado: 'COMPLETADO', detalle });
      }
      if (v.estado === 'REMEDIADO' && v.fechaRemediacion) {
        const fuera = v.fechaLimite !== null && v.fechaRemediacion > v.fechaLimite;
        eventos.push({ ...base, fueraDePlazo: fuera, clave: `v2r-${v.id}`, capa: 2, tipo: 'REAL', titulo: `Remediada: ${nombre(v)}`, inicio: v.fechaRemediacion, fin: null, estado: 'COMPLETADO', detalle });
      }
    }
  }

  return eventos
    .filter((e) => e.inicio <= d.hasta && (e.fin ?? e.inicio) >= d.desde)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
