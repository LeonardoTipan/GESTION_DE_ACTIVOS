import type { Capa, EstadoEvento, EventoAgendaDto } from '../../common/dto/agenda.dto.js';
import type { ActivoBreveDto } from '../../common/dto/registro.dto.js';
import { estaVencido, limiteEfectivo } from '../mantenimientos/transiciones.js';

/**
 * Agenda de mantenimientos, en sus DOS fases, a partir de lo que hay en la
 * base. Función pura. Distingue SIEMPRE lo previsto (un intervalo) de lo real.
 *   1 Planificación: intervalos previstos de las ejecuciones y próximas
 *     intervenciones de las planificaciones vigentes (aún sin ejecución).
 *   2 Ejecución: pendientes (previstas sin iniciar) y lo realmente ejecutado.
 * El mantenimiento no tiene fase de verificación: una ejecución completada,
 * con su verificable, está terminada. La capa 3 no devuelve eventos.
 */

const DIA = 86_400_000;

export interface MantenimientoAgenda {
  id: number;
  tipo: string;
  fase: 'PROGRAMADO' | 'EN_EJECUCION' | 'FINALIZADO' | 'CANCELADO';
  actividad: string;
  fecha: Date;
  fechaLimite: Date | null;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  tecnico: string | null;
  estadoEquipo: string | null;
  fueraDePlazo: boolean;
  activo: ActivoBreveDto;
}

export interface PlanAgenda {
  id: number;
  tipo: string;
  frecuencia: 'UNICA' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  proximaFecha: Date | null;
  plazoDias: number;
  responsable: string;
  activo: ActivoBreveDto;
}

const TIPO = (t: string) => t.toLowerCase();
const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`;

export function agendaMantenimientos(d: {
  mantenimientos: MantenimientoAgenda[];
  planes: PlanAgenda[];
  desde: Date;
  hasta: Date;
  ahora: Date;
  capa?: Capa;
}): EventoAgendaDto[] {
  const eventos: EventoAgendaDto[] = [];
  const quiere = (c: Capa) => !d.capa || d.capa === c;
  const evento = (e: Omit<EventoAgendaDto, 'modulo'>) => eventos.push({ modulo: 'mantenimientos', ...e });
  const previsto = (inicio: Date, fin: Date | null): EstadoEvento =>
    (fin ?? inicio) < d.ahora ? 'VENCIDO' : 'PROGRAMADO';

  for (const m of d.mantenimientos) {
    const limite = limiteEfectivo(m);
    const base = {
      activo: m.activo,
      ruta: `/mantenimientos/${m.id}`,
      fueraDePlazo: m.fueraDePlazo,
      responsable: m.tecnico,
    };
    // Capa 1: el intervalo previsto, con el estado en que está el trabajo.
    if (quiere(1)) {
      const estado: EstadoEvento =
        m.fase === 'CANCELADO' ? 'CANCELADO' : m.fase === 'FINALIZADO' ? 'COMPLETADO' : estaVencido(m, d.ahora) ? 'VENCIDO' : m.fase === 'EN_EJECUCION' ? 'EN_CURSO' : 'PROGRAMADO';
      evento({ ...base, clave: `m1-${m.id}`, capa: 1, tipo: 'PREVISTO', titulo: `Mantenimiento ${TIPO(m.tipo)} #${m.id}`, inicio: m.fecha, fin: m.fechaLimite, estado, detalle: m.actividad });
    }
    // Capa 2: lo pendiente (previsto) y lo ejecutado (real).
    if (quiere(2)) {
      if (m.fase === 'PROGRAMADO') {
        evento({ ...base, clave: `m2p-${m.id}`, capa: 2, tipo: 'PREVISTO', titulo: `Pendiente: mantenimiento #${m.id}`, inicio: m.fecha, fin: m.fechaLimite, estado: estaVencido(m, d.ahora) ? 'VENCIDO' : 'PROGRAMADO', detalle: m.actividad });
      } else if (m.fechaInicio || m.fechaFin) {
        const estado: EstadoEvento =
          m.fase === 'CANCELADO' ? 'CANCELADO' : m.fase === 'EN_EJECUCION' ? (limite && limite < d.ahora ? 'VENCIDO' : 'EN_CURSO') : m.estadoEquipo === 'FUERA_DE_SERVICIO' ? 'FALLIDO' : 'COMPLETADO';
        evento({ ...base, clave: `m2r-${m.id}`, capa: 2, tipo: 'REAL', titulo: `Ejecutado: mantenimiento #${m.id}`, inicio: m.fechaInicio ?? m.fechaFin!, fin: m.fechaFin, estado, detalle: m.actividad });
      }
    }
  }

  // Capa 1: la PRÓXIMA intervención de cada plan vigente sin ejecución pendiente. Solo la
  // siguiente: las posteriores dependen del fin real de esa (no se proyectan fechas ficticias).
  if (quiere(1)) {
    for (const p of d.planes) {
      const fecha = p.proximaFecha;
      if (!fecha || fecha > d.hasta) continue;
      const fin = new Date(fecha.getTime() + p.plazoDias * DIA);
      if (fin >= d.desde) {
        eventos.push({ modulo: 'mantenimientos', clave: `p1-${p.id}-0`, capa: 1, tipo: 'PREVISTO', titulo: `Planificación ${folio(p.id)}: ${TIPO(p.tipo)} por ejecutar`, inicio: fecha, fin, estado: previsto(fecha, fin), fueraDePlazo: false, responsable: p.responsable, activo: p.activo, ruta: '/mantenimientos?capa=planificacion', detalle: `Período ${p.frecuencia.toLowerCase()} · próxima intervención (desde el último fin real)` });
      }
    }
  }

  return eventos
    .filter((e) => e.inicio <= d.hasta && (e.fin ?? e.inicio) >= d.desde)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
