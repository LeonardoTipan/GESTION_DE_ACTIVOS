import {
  indicador,
  porcentaje,
  type IndicadorDto,
} from '../../common/indicadores/indicador.js';
import { estaVencido, limiteEfectivo } from './transiciones.js';

/** Lo que necesitan los indicadores de un mantenimiento VIGENTE (no anulado). */
export interface MantenimientoParaIndicador {
  id: number;
  tipo: string;
  fase: string;
  estadoEquipo: string | null;
  fecha: Date;
  fechaLimite?: Date | null;
  fechaInicio: Date | null;
  fechaFin: Date | null;
}

/**
 * Indicadores de mantenimiento de equipos (ISO/IEC 27001:2022, A.7.13) sobre
 * los mantenimientos programados en el período. Solo usa campos existentes.
 * Función pura.
 */
export function indicadoresMantenimiento(
  registros: MantenimientoParaIndicador[],
  ahora: Date,
): IndicadorDto[] {
  const activos = registros.filter((m) => m.fase !== 'CANCELADO');
  // Exigibles: los que ya debían haberse hecho (venció su plazo).
  const exigibles = activos.filter((m) => (limiteEfectivo(m as never) ?? m.fecha) <= ahora);
  const finalizados = exigibles.filter((m) => m.fase === 'FINALIZADO');
  const vencidos = activos.filter((m) => estaVencido(m as never, ahora));
  const cerrados = registros.filter((m) => m.fase === 'FINALIZADO');
  const operativos = cerrados.filter((m) => m.estadoEquipo === 'OPERATIVO');
  const preventivos = activos.filter((m) => m.tipo === 'PREVENTIVO');
  const conDuracion = cerrados.filter((m) => m.fechaInicio && m.fechaFin);
  const duracionMedia = conDuracion.length
    ? Math.round(
        conDuracion.reduce((s, m) => s + (m.fechaFin!.getTime() - m.fechaInicio!.getTime()), 0) /
          conDuracion.length /
          60_000,
      )
    : null;

  return [
    indicador({
      id: 'MAN-01',
      nombre: 'Mantenimientos realizados según lo programado',
      control: 'A.7.13',
      unidad: '%',
      valor: porcentaje(finalizados.length, exigibles.length),
      meta: 95,
      formula: `finalizados ÷ programados con fecha cumplida (sin cancelados) × 100 = ${finalizados.length}/${exigibles.length}`,
      hallazgo: `${exigibles.length - finalizados.length} mantenimiento(s) con fecha cumplida que no se han finalizado.`,
    }),
    indicador({
      id: 'MAN-02',
      nombre: 'Mantenimientos vencidos sin completar',
      control: 'A.7.13',
      unidad: '',
      valor: vencidos.length,
      meta: 0,
      direccion: 'bajar',
      formula: `sin finalizar y con el límite previsto ya pasado = ${vencidos.length}`,
      hallazgo: `Vencidos: ${vencidos.map((m) => `#${m.id}`).join(', ')}.`,
    }),
    indicador({
      id: 'MAN-03',
      nombre: 'Equipos operativos tras el mantenimiento',
      control: 'A.7.13',
      unidad: '%',
      valor: porcentaje(operativos.length, cerrados.length),
      meta: 100,
      formula: `finalizados con el equipo OPERATIVO ÷ finalizados × 100 = ${operativos.length}/${cerrados.length}`,
      hallazgo: `${cerrados.length - operativos.length} equipo(s) quedaron degradados o fuera de servicio.`,
    }),
    indicador({
      id: 'MAN-04',
      nombre: 'Mantenimientos preventivos',
      control: 'A.7.13',
      unidad: '%',
      valor: porcentaje(preventivos.length, activos.length),
      meta: 70,
      formula: `preventivos ÷ mantenimientos del período (sin cancelados) × 100 = ${preventivos.length}/${activos.length}`,
      hallazgo: 'Predominan los mantenimientos correctivos: conviene planificar más preventivos.',
    }),
    indicador({
      id: 'MAN-05',
      nombre: 'Duración media de un mantenimiento',
      control: 'A.7.13',
      unidad: 'min',
      valor: duracionMedia,
      meta: 240,
      direccion: 'bajar',
      formula: `suma de (fin − inicio) ÷ finalizados con ambas fechas = ${duracionMedia ?? 's/d'} min sobre ${conDuracion.length}`,
      hallazgo: `La duración media (${duracionMedia} min) supera las 4 horas de referencia.`,
    }),
  ];
}
