import {
  indicador,
  porcentaje,
  type IndicadorDto,
} from '../../common/indicadores/indicador.js';

/** Lo que necesitan los indicadores de una vulnerabilidad VIGENTE (no anulada). */
export interface VulnerabilidadParaIndicador {
  id: number;
  cve: string | null;
  nivelRiesgo: string;
  estado: string;
  fecha: Date;
  fechaLimite: Date | null;
  fechaRemediacion: Date | null;
}

const ABIERTAS = ['ABIERTO', 'EN_PROGRESO'];
const DIA = 24 * 3_600_000;

/**
 * Indicadores de gestión de vulnerabilidades técnicas (ISO/IEC 27001:2022,
 * A.8.8). `actuales` son TODAS las vigentes (estado de hoy); `delPeriodo`, las
 * detectadas en el período. Usan la fecha REAL de remediación (la indica el
 * usuario), no la de registro. Función pura.
 */
export function indicadoresVulnerabilidad(
  actuales: VulnerabilidadParaIndicador[],
  delPeriodo: VulnerabilidadParaIndicador[],
  ahora: Date,
): IndicadorDto[] {
  const abiertas = actuales.filter((v) => ABIERTAS.includes(v.estado));
  const graves = abiertas.filter((v) => v.nivelRiesgo === 'ALTO' || v.nivelRiesgo === 'CRITICO');
  const fueraDePlazo = abiertas.filter((v) => v.fechaLimite && v.fechaLimite < ahora);
  const remediadas = delPeriodo.filter((v) => v.estado === 'REMEDIADO' && v.fechaRemediacion);
  const conPlazo = remediadas.filter((v) => v.fechaLimite);
  const aTiempo = conPlazo.filter((v) => v.fechaRemediacion! <= v.fechaLimite!);
  const diasMedios = remediadas.length
    ? Math.round(
        (remediadas.reduce((s, v) => s + (v.fechaRemediacion!.getTime() - v.fecha.getTime()), 0) /
          remediadas.length /
          DIA) *
          10,
      ) / 10
    : null;
  const nombre = (v: VulnerabilidadParaIndicador) => v.cve ?? `#${v.id}`;

  return [
    indicador({
      id: 'VUL-01',
      nombre: 'Vulnerabilidades de criticidad crítica o alta pendientes',
      control: 'A.8.8',
      unidad: '',
      valor: graves.length,
      meta: 0,
      direccion: 'bajar',
      formula: `abiertas o en progreso con criticidad ALTA o CRÍTICA = ${graves.length}`,
      hallazgo: `Pendientes: ${graves.map(nombre).join(', ')}.`,
    }),
    indicador({
      id: 'VUL-02',
      nombre: 'Vulnerabilidades fuera del plazo de remediación',
      control: 'A.8.8',
      unidad: '',
      valor: fueraDePlazo.length,
      meta: 0,
      direccion: 'bajar',
      formula: `pendientes con la fecha límite vencida = ${fueraDePlazo.length}`,
      hallazgo: `Fuera de plazo: ${fueraDePlazo.map(nombre).join(', ')}.`,
    }),
    indicador({
      id: 'VUL-03',
      nombre: 'Remediadas dentro del plazo',
      control: 'A.8.8',
      unidad: '%',
      valor: porcentaje(aTiempo.length, conPlazo.length),
      meta: 100,
      formula: `remediadas antes de su fecha límite ÷ remediadas con fecha límite × 100 = ${aTiempo.length}/${conPlazo.length}`,
      hallazgo: `${conPlazo.length - aTiempo.length} vulnerabilidad(es) se remediaron después de su fecha límite.`,
    }),
    indicador({
      id: 'VUL-04',
      nombre: 'Tiempo medio de remediación',
      control: 'A.8.8',
      unidad: 'días',
      valor: diasMedios,
      meta: 30,
      direccion: 'bajar',
      formula: `suma de (remediación − detección) ÷ remediadas = ${diasMedios ?? 's/d'} días sobre ${remediadas.length}`,
      hallazgo: `El tiempo medio de remediación (${diasMedios} días) supera los 30 días de referencia.`,
    }),
  ];
}
