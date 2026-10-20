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
  fechaCierre: Date | null;
}

const ABIERTAS = ['ABIERTA', 'EN_MITIGACION'];
const DIA = 24 * 3_600_000;

/**
 * Indicadores de gestión de vulnerabilidades técnicas (ISO/IEC 27001:2022,
 * A.8.8). `actuales` son TODAS las vigentes (estado de hoy); `delPeriodo`, las
 * detectadas en el período. Solo usa campos existentes. Función pura.
 */
export function indicadoresVulnerabilidad(
  actuales: VulnerabilidadParaIndicador[],
  delPeriodo: VulnerabilidadParaIndicador[],
  ahora: Date,
): IndicadorDto[] {
  const abiertas = actuales.filter((v) => ABIERTAS.includes(v.estado));
  const graves = abiertas.filter((v) => v.nivelRiesgo === 'ALTO' || v.nivelRiesgo === 'CRITICO');
  const fueraDePlazo = abiertas.filter((v) => v.fechaLimite && v.fechaLimite < ahora);
  const mitigadas = delPeriodo.filter((v) => v.estado === 'MITIGADA' && v.fechaCierre);
  const conPlazo = mitigadas.filter((v) => v.fechaLimite);
  const aTiempo = conPlazo.filter((v) => v.fechaCierre! <= v.fechaLimite!);
  const diasMedios = mitigadas.length
    ? Math.round(
        (mitigadas.reduce((s, v) => s + (v.fechaCierre!.getTime() - v.fecha.getTime()), 0) /
          mitigadas.length /
          DIA) *
          10,
      ) / 10
    : null;
  const nombre = (v: VulnerabilidadParaIndicador) => v.cve ?? `#${v.id}`;

  return [
    indicador({
      id: 'VUL-01',
      nombre: 'Vulnerabilidades críticas o altas abiertas',
      control: 'A.8.8',
      unidad: '',
      valor: graves.length,
      meta: 0,
      direccion: 'bajar',
      formula: `abiertas o en mitigación con riesgo ALTO o CRÍTICO = ${graves.length}`,
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
      formula: `abiertas con la fecha límite vencida = ${fueraDePlazo.length}`,
      hallazgo: `Fuera de plazo: ${fueraDePlazo.map(nombre).join(', ')}.`,
    }),
    indicador({
      id: 'VUL-03',
      nombre: 'Mitigadas dentro del plazo',
      control: 'A.8.8',
      unidad: '%',
      valor: porcentaje(aTiempo.length, conPlazo.length),
      meta: 100,
      formula: `mitigadas antes de su fecha límite ÷ mitigadas con fecha límite × 100 = ${aTiempo.length}/${conPlazo.length}`,
      hallazgo: `${conPlazo.length - aTiempo.length} vulnerabilidad(es) se mitigaron después de su fecha límite.`,
    }),
    indicador({
      id: 'VUL-04',
      nombre: 'Tiempo medio de mitigación',
      control: 'A.8.8',
      unidad: 'días',
      valor: diasMedios,
      meta: 30,
      direccion: 'bajar',
      formula: `suma de (cierre − detección) ÷ mitigadas = ${diasMedios ?? 's/d'} días sobre ${mitigadas.length}`,
      hallazgo: `El tiempo medio de mitigación (${diasMedios} días) supera los 30 días de referencia.`,
    }),
  ];
}
