import type { Capa, EstadoEvento, EventoAgendaDto } from '../../common/dto/agenda.dto.js';
import type { ActivoBreveDto } from '../../common/dto/registro.dto.js';
import { estaVencido, limiteEfectivo } from '../mantenimientos/transiciones.js';
import { siguienteFecha } from './frecuencia.js';

/**
 * Agenda de mantenimientos, en sus tres capas, a partir de lo que hay en la
 * base. Función pura. Distingue SIEMPRE lo previsto (un intervalo) de lo real.
 *   1 Planificación: intervalos previstos de los mantenimientos y próximas
 *     intervenciones de los planes vigentes (aún sin programar).
 *   2 Ejecución: pendientes (previstos sin iniciar) y lo realmente ejecutado.
 *   3 Verificación: ventanas previstas de verificación y las verificaciones hechas.
 */

const DIA = 86_400_000;
const TOPE_POR_PLAN = 60;

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
  verificacionPrevista: Date | null;
  verificacionLimite: Date | null;
  activo: ActivoBreveDto;
  verificaciones: { resultado: string; anuladoEn: Date | null }[];
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

export interface VerificacionAgenda {
  id: number;
  mantenimientoId: number;
  fecha: Date;
  resultado: 'OPERATIVO' | 'REQUIERE_SEGUIMIENTO' | 'NO_SATISFACTORIO';
  responsable: string;
  fueraDePlazo: boolean;
  activo: ActivoBreveDto;
}

const TIPO = (t: string) => (t === 'PREVENTIVO' ? 'preventivo' : 'correctivo');
const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`;

export function agendaMantenimientos(d: {
  mantenimientos: MantenimientoAgenda[];
  planes: PlanAgenda[];
  verificaciones: VerificacionAgenda[];
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
    // Capa 3: la verificación pendiente (con su propia ventana).
    if (quiere(3) && m.fase === 'FINALIZADO') {
      const vigentes = m.verificaciones.filter((v) => !v.anuladoEn);
      const cerrado = vigentes.at(-1)?.resultado === 'OPERATIVO';
      if (!cerrado) {
        const inicio = m.verificacionPrevista ?? m.fechaFin ?? m.fecha;
        evento({ ...base, clave: `m3p-${m.id}`, capa: 3, tipo: 'PREVISTO', titulo: `Verificar mantenimiento #${m.id}`, inicio, fin: m.verificacionLimite, estado: m.verificacionLimite ? previsto(inicio, m.verificacionLimite) : 'PROGRAMADO', detalle: m.verificacionPrevista ? 'Verificación programada' : 'Verificación sin programar' });
      }
    }
  }

  if (quiere(3)) {
    for (const v of d.verificaciones) {
      const estado: EstadoEvento = v.resultado === 'OPERATIVO' ? 'COMPLETADO' : v.resultado === 'NO_SATISFACTORIO' ? 'FALLIDO' : 'EN_CURSO';
      eventos.push({ modulo: 'mantenimientos', clave: `m3r-${v.id}`, capa: 3, tipo: 'REAL', titulo: `Verificación #${v.mantenimientoId}: ${v.resultado.replace(/_/g, ' ').toLowerCase()}`, inicio: v.fecha, fin: null, estado, fueraDePlazo: v.fueraDePlazo, responsable: v.responsable, activo: v.activo, ruta: `/mantenimientos/${v.mantenimientoId}`, detalle: null });
    }
  }

  // Capa 1: próximas intervenciones de los planes vigentes (aún sin programar).
  if (quiere(1)) {
    for (const p of d.planes) {
      let fecha = p.proximaFecha;
      for (let n = 0; fecha && fecha <= d.hasta && n < TOPE_POR_PLAN; n++) {
        const fin = new Date(fecha.getTime() + p.plazoDias * DIA);
        if (fin >= d.desde) {
          eventos.push({ modulo: 'mantenimientos', clave: `p1-${p.id}-${n}`, capa: 1, tipo: 'PREVISTO', titulo: `Plan ${folio(p.id)}: ${TIPO(p.tipo)} por programar`, inicio: fecha, fin, estado: previsto(fecha, fin), fueraDePlazo: false, responsable: p.responsable, activo: p.activo, ruta: '/mantenimientos?capa=planificacion', detalle: `Frecuencia ${p.frecuencia.toLowerCase()}` });
        }
        fecha = siguienteFecha(fecha, p.frecuencia);
      }
    }
  }

  return eventos
    .filter((e) => e.inicio <= d.hasta && (e.fin ?? e.inicio) >= d.desde)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
