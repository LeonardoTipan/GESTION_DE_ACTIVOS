import { construirBitacora, INDICADORES_EXCEL } from '../../common/bitacora/bitacora.js';
import type { BitacoraIndicadorDto } from '../../common/bitacora/dto.js';
import type { PeriodoBitacora } from '../../common/bitacora/periodos.js';
import { MOTIVOS_PRUEBA } from '../tablero/tablero.js';
import { estadoVentana, ventanasDe, type EstadoVentana, type FrecuenciaVentana } from '../tablero/ventanas.js';

/**
 * Bitácora General MENSUAL de Respaldos (decisión del 06/11/2026, opción A), con el criterio
 * del indicador RES-01b del tablero:
 *   Total programados: ventanas de ejecución que el plan exigía en el mes (ya cerradas o ya
 *     cubiertas), de los planes VIGENTES en ese momento. Cada ventana cuenta en el mes en que
 *     termina (una semana que cruza de mes no se cuenta dos veces).
 *   Respaldos validados: de ellas, las cubiertas por una ejecución EXITOSA. Una FALLIDA o
 *     PARCIAL no valida la ventana (sigue listada en la específica).
 * Las pruebas de restauración son una fila informativa aparte. Funciones puras; las fechas
 * son DÍAS locales «AAAA-MM-DD».
 */

export interface PlanBitacoraRespaldo {
  id: number;
  activo: { id: number; codigo: string; nombre: string };
  responsable: string;
  frecuencia: FrecuenciaVentana;
  vigenteDesde: string;
  /** Intervalos en que el plan estuvo VIGENTE [desde, hasta) — hasta null = sigue vigente. */
  vigencias: { desde: string; hasta: string | null }[];
  /** Día en que el activo dejó de estar operativo (baja o inactivo en GLPI); null = operativo. */
  bajaActivo: string | null;
}

export interface EjecucionBitacoraRespaldo {
  id: number;
  planId: number;
  fecha: string;
  resultado: string;
  responsable: string;
  evidencia: string | null;
}

export interface RestauracionBitacoraRespaldo {
  id: number;
  ejecucionId: number;
  fecha: string;
  resultado: string;
  motivo: string;
  evidencia: string;
  responsable: string;
}

export interface VentanaBitacoraRespaldo {
  planId: number;
  activo: PlanBitacoraRespaldo['activo'];
  responsablePlan: string;
  ini: string;
  fin: string;
  etiqueta: string;
  /** Mes (1–12) en que termina la ventana: el de la Bitácora General. */
  mes: number;
  situacion: EstadoVentana;
  /** La ejecución EXITOSA que la valida o, si no la hay, la última registrada en la ventana. */
  ejecucion: EjecucionBitacoraRespaldo | null;
  /** Ejecuciones de la ventana que no la validan (FALLIDA o PARCIAL). */
  noValidas: number;
  /** Última restauración (o prueba) de esa ejecución. */
  restauracion: RestauracionBitacoraRespaldo | null;
}

export const CRITERIO_RESPALDOS =
  'Total programados: ventanas de ejecución exigibles en el mes (ya terminadas o ya cubiertas) de los planes de respaldo ' +
  'vigentes en ese momento; cada ventana cuenta en el mes en que termina. Respaldos validados: las ventanas cubiertas por ' +
  'una ejecución EXITOSA (una fallida o parcial no la valida). Sin registros anulados. Las pruebas de restauración se muestran aparte.';

const vigenteEl = (p: PlanBitacoraRespaldo, dia: string) =>
  (p.bajaActivo === null || dia < p.bajaActivo) && p.vigencias.some((v) => v.desde <= dia && (v.hasta === null || dia < v.hasta));

/** Ventanas de ejecución del año de todos los planes, con su situación y su cobertura. */
export function ventanasDelAnio(
  anio: number,
  planes: PlanBitacoraRespaldo[],
  ejecuciones: EjecucionBitacoraRespaldo[],
  restauraciones: RestauracionBitacoraRespaldo[],
  hoy: string,
): VentanaBitacoraRespaldo[] {
  const periodo = { ini: `${anio}-01-01`, fin: `${anio}-12-31` };
  const salida: VentanaBitacoraRespaldo[] = [];
  for (const p of planes) {
    const propias = ejecuciones.filter((e) => e.planId === p.id);
    for (const w of ventanasDe(p.frecuencia, p.vigenteDesde, periodo, hoy)) {
      if (!vigenteEl(p, w.ini)) continue;
      const enVentana = propias.filter((e) => e.fecha >= w.ini && e.fecha <= w.fin).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
      const exitosas = enVentana.filter((e) => e.resultado === 'EXITOSO');
      const ejecucion = exitosas.at(-1) ?? enVentana.at(-1) ?? null;
      const restauracion = ejecucion
        ? (restauraciones.filter((r) => r.ejecucionId === ejecucion.id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id).at(-1) ?? null)
        : null;
      salida.push({
        planId: p.id,
        activo: p.activo,
        responsablePlan: p.responsable,
        ini: w.ini,
        fin: w.fin,
        etiqueta: w.etiqueta,
        mes: Number(w.fin.slice(5, 7)),
        situacion: estadoVentana(w, exitosas.map((e) => e.fecha), hoy),
        ejecucion,
        noValidas: enVentana.length - exitosas.length,
        restauracion,
      });
    }
  }
  return salida;
}

/** Cuenta para el indicador: ya terminada sin cubrir (VENCIDA) o ya cubierta (CUMPLIDA). */
export const exigible = (w: VentanaBitacoraRespaldo) => w.situacion === 'CUMPLIDA' || w.situacion === 'VENCIDA';

export const INFORMATIVAS_RESPALDOS = [
  { etiqueta: 'Pruebas de restauración exitosas', descripcion: 'Restauraciones de prueba (programada o de integridad) con resultado EXITOSO en el mes.' },
  { etiqueta: 'Ejecuciones fallidas o parciales', descripcion: 'Registradas en el mes: no validan ninguna ventana.' },
  { etiqueta: 'Ventanas aún en curso', descripcion: 'Ventanas del mes que todavía no terminan: no cuentan hasta cerrarse o cubrirse.' },
];

export function bitacoraRespaldos(
  anio: number,
  ventanas: VentanaBitacoraRespaldo[],
  ejecuciones: EjecucionBitacoraRespaldo[],
  restauraciones: RestauracionBitacoraRespaldo[],
  ahora = new Date(),
  zona?: string,
): BitacoraIndicadorDto {
  const delMes = (p: PeriodoBitacora) => Number(p.clave.slice(5, 7));
  const enMes = (dia: string, mes: number) => dia.startsWith(`${anio}-${String(mes).padStart(2, '0')}`);
  return construirBitacora({
    anio,
    ahora,
    zona,
    indicador: { ...INDICADORES_EXCEL.respaldos, criterio: CRITERIO_RESPALDOS },
    informativas: INFORMATIVAS_RESPALDOS,
    calcular: (p) => {
      const mes = delMes(p);
      const propias = ventanas.filter((w) => w.mes === mes);
      const exigibles = propias.filter(exigible);
      return {
        numerador: exigibles.filter((w) => w.situacion === 'CUMPLIDA').length,
        denominador: exigibles.length,
        informativas: {
          'Pruebas de restauración exitosas': restauraciones.filter((r) => r.resultado === 'EXITOSO' && MOTIVOS_PRUEBA.includes(r.motivo) && enMes(r.fecha, mes)).length,
          'Ejecuciones fallidas o parciales': ejecuciones.filter((e) => e.resultado !== 'EXITOSO' && enMes(e.fecha, mes)).length,
          'Ventanas aún en curso': propias.length - exigibles.length,
        },
      };
    },
  });
}

/**
 * Intervalos de vigencia de un plan a partir de su alta y de los cambios de estado de su
 * auditoría (VIGENTE ⇄ SUSPENDIDO). `cambios` en orden cronológico, con el día local.
 */
export function vigencias(
  vigenteDesde: string,
  estadoActual: string,
  cambios: { dia: string; antes: unknown; despues: unknown }[],
): { desde: string; hasta: string | null }[] {
  // Estado al darse de alta: el «antes» del primer cambio o, sin cambios, el actual.
  let vigente = (cambios[0]?.antes ?? estadoActual) === 'VIGENTE';
  const salida: { desde: string; hasta: string | null }[] = [];
  let abierto: string | null = vigente ? vigenteDesde : null;
  for (const c of cambios) {
    const ahoraVigente = c.despues === 'VIGENTE';
    if (vigente && !ahoraVigente && abierto !== null) {
      salida.push({ desde: abierto, hasta: c.dia });
      abierto = null;
    } else if (!vigente && ahoraVigente) {
      abierto = c.dia > vigenteDesde ? c.dia : vigenteDesde;
    }
    vigente = ahoraVigente;
  }
  if (abierto !== null) salida.push({ desde: abierto, hasta: null });
  return salida;
}
