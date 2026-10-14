import {
  indicador,
  porcentaje,
  type IndicadorDto,
} from '../../common/indicadores/indicador.js';
import {
  estadoVentana,
  ventanasDe,
  type EstadoVentana,
  type FrecuenciaVentana,
  type Ventana,
} from './ventanas.js';

/** Motivos de restauración que cuentan como prueba (verificable) del plan. */
export const MOTIVOS_PRUEBA = ['PRUEBA_PROGRAMADA', 'VERIFICACION_INTEGRIDAD'];

/** Objetivo institucional de tiempo medio de restauración (min), como en el prototipo. */
export const MTTR_OBJETIVO_MIN = 180;

export interface ActivoResumen {
  id: number;
  codigo: string;
  nombre: string;
}

/** Lo que el tablero necesita de la base: solo registros vigentes (no anulados). */
export interface DatosTablero {
  hoy: string;
  periodo: { ini: string; fin: string };
  /** Activos de criticidad alta que siguen operativos. */
  criticos: ActivoResumen[];
  /** Planes VIGENTES no anulados. */
  planes: {
    id: number;
    activo: ActivoResumen;
    frecuencia: FrecuenciaVentana;
    frecuenciaPrueba: FrecuenciaVentana;
    vigenteDesde: string;
  }[];
  /** Ejecuciones no anuladas del período. */
  ejecuciones: {
    id: number;
    activoId: number;
    fecha: string;
    resultado: string;
    cifrado: boolean;
    fueraSitio: boolean;
    inmutable: boolean;
    integridad: boolean;
  }[];
  /** Restauraciones no anuladas del período. */
  restauraciones: {
    id: number;
    activoId: number;
    fecha: string;
    motivo: string;
    tiempoRealMin: number;
    rtoMinutos: number;
  }[];
}

export interface VentanaConEstado extends Ventana {
  estado: EstadoVentana;
  /** Ids de las ejecuciones (o restauraciones) que la cubren. */
  registros: number[];
}

export interface CalendarioPlan {
  planId: number;
  activo: ActivoResumen;
  frecuencia: FrecuenciaVentana;
  frecuenciaPrueba: FrecuenciaVentana;
  ejecucion: VentanaConEstado[];
  prueba: VentanaConEstado[];
}

export interface Tablero {
  indicadores: IndicadorDto[];
  calendario: CalendarioPlan[];
  /** Ventanas en curso o vencidas sin registro. */
  pendientes: { ejecucion: number; prueba: number };
}

const lista = (nombres: string[]) => nombres.join(', ') || '—';

/** Indicadores RES-00…RES-07 y calendarios del período. Función pura. */
export function calcularTablero(d: DatosTablero): Tablero {
  const { hoy, periodo } = d;
  const calendario: CalendarioPlan[] = d.planes.map((p) => {
    const delActivo = <T extends { activoId: number }>(xs: T[]) =>
      xs.filter((x) => x.activoId === p.activo.id);
    const ejecuciones = delActivo(d.ejecuciones);
    const pruebas = delActivo(d.restauraciones).filter((r) => MOTIVOS_PRUEBA.includes(r.motivo));
    const conEstado = (
      ventanas: Ventana[],
      registros: { id: number; fecha: string }[],
    ): VentanaConEstado[] =>
      ventanas.map((w) => ({
        ...w,
        estado: estadoVentana(w, registros.map((r) => r.fecha), hoy),
        registros: registros.filter((r) => r.fecha >= w.ini && r.fecha <= w.fin).map((r) => r.id),
      }));
    return {
      planId: p.id,
      activo: p.activo,
      frecuencia: p.frecuencia,
      frecuenciaPrueba: p.frecuenciaPrueba,
      ejecucion: conEstado(ventanasDe(p.frecuencia, p.vigenteDesde, periodo, hoy), ejecuciones),
      prueba: conEstado(ventanasDe(p.frecuenciaPrueba, p.vigenteDesde, periodo, hoy), pruebas),
    };
  });

  const ventanasEjec = calendario.flatMap((c) => c.ejecucion.map((w) => ({ ...w, activo: c.activo })));
  const ventanasPrueba = calendario.flatMap((c) => c.prueba.map((w) => ({ ...w, activo: c.activo })));
  // Exigibles: las ya cerradas, o las que ya tienen ejecución.
  const exigibles = ventanasEjec.filter((w) => w.estado === 'CUMPLIDA' || w.estado === 'VENCIDA');
  const cumplidas = exigibles.filter((w) => w.estado === 'CUMPLIDA');
  const pruebasCumplidas = ventanasPrueba.filter((w) => w.estado === 'CUMPLIDA');

  const conPlan = new Set(d.planes.map((p) => p.activo.id));
  const criticosCubiertos = d.criticos.filter((a) => conPlan.has(a.id));
  const R = d.ejecuciones;
  const T = d.restauraciones;
  const exitosas = R.filter((r) => r.resultado === 'EXITOSO');
  const cifradas = R.filter((r) => r.cifrado);
  const integras = R.filter((r) => r.integridad);
  const cumplen321 = d.criticos.filter((a) => {
    const rs = R.filter((r) => r.activoId === a.id);
    return rs.some((r) => r.fueraSitio) && rs.some((r) => r.inmutable);
  });
  const dentroRto = T.filter((r) => r.tiempoRealMin <= r.rtoMinutos);
  const mttr = T.length
    ? Math.round(T.reduce((s, r) => s + r.tiempoRealMin, 0) / T.length)
    : null;

  const indicadores = [
    indicador({
      id: 'RES-00',
      nombre: 'Cobertura del plan de respaldo (activos críticos)',
      control: 'A.8.13',
      unidad: '%',
      valor: porcentaje(criticosCubiertos.length, d.criticos.length),
      meta: 100,
      formula: `activos críticos con plan vigente ÷ activos críticos × 100 = ${criticosCubiertos.length}/${d.criticos.length}`,
      hallazgo: `Activos críticos sin plan de respaldo: ${lista(d.criticos.filter((a) => !conPlan.has(a.id)).map((a) => a.nombre))}.`,
    }),
    indicador({
      id: 'RES-01b',
      nombre: 'Ventanas programadas cubiertas',
      control: 'A.8.13',
      unidad: '%',
      valor: porcentaje(cumplidas.length, exigibles.length),
      meta: 95,
      formula: `ventanas con ejecución ÷ ventanas exigibles del período × 100 = ${cumplidas.length}/${exigibles.length}`,
      hallazgo: `Ventanas vencidas sin ejecutar: ${lista(exigibles.filter((w) => w.estado === 'VENCIDA').map((w) => `${w.activo.nombre} · ${w.corto}`))}.`,
    }),
    indicador({
      id: 'RES-01',
      nombre: 'Tasa de éxito de respaldos',
      control: 'A.8.13',
      unidad: '%',
      valor: porcentaje(exitosas.length, R.length),
      meta: 98,
      formula: `respaldos exitosos ÷ respaldos ejecutados × 100 = ${exitosas.length}/${R.length}`,
      hallazgo: `${R.length - exitosas.length} ejecución(es) con resultado fallido o parcial.`,
    }),
    indicador({
      id: 'RES-02',
      nombre: 'Respaldos cifrados',
      control: 'A.8.24',
      unidad: '%',
      valor: porcentaje(cifradas.length, R.length),
      meta: 100,
      formula: `respaldos con cifrado ÷ respaldos ejecutados × 100 = ${cifradas.length}/${R.length}`,
      hallazgo: `${R.length - cifradas.length} respaldo(s) almacenado(s) sin cifrado.`,
    }),
    indicador({
      id: 'RES-03',
      nombre: 'Activos críticos con esquema 3-2-1',
      control: 'A.8.13',
      unidad: '%',
      valor: porcentaje(cumplen321.length, d.criticos.length),
      meta: 100,
      formula: `activos críticos con copia fuera de sitio y copia inmutable ÷ activos críticos × 100 = ${cumplen321.length}/${d.criticos.length}`,
      hallazgo: `Sin copia fuera de sitio o inmutable en el período: ${lista(d.criticos.filter((a) => !cumplen321.includes(a)).map((a) => a.nombre))}.`,
    }),
    indicador({
      id: 'RES-04',
      nombre: 'Ventanas de prueba con verificable registrado',
      control: 'A.5.30',
      unidad: '%',
      valor: porcentaje(pruebasCumplidas.length, ventanasPrueba.length),
      meta: 100,
      formula: `ventanas de prueba con restauración verificada ÷ ventanas de prueba del período × 100 = ${pruebasCumplidas.length}/${ventanasPrueba.length}`,
      hallazgo: `Ventanas de prueba sin verificable: ${lista(ventanasPrueba.filter((w) => w.estado !== 'CUMPLIDA').map((w) => `${w.activo.nombre} · ${w.corto}`))}.`,
    }),
    indicador({
      id: 'RES-05',
      nombre: 'Restauraciones dentro del RTO',
      control: 'A.5.30',
      unidad: '%',
      valor: porcentaje(dentroRto.length, T.length),
      meta: 100,
      formula: `restauraciones con tiempo ≤ RTO ÷ restauraciones del período × 100 = ${dentroRto.length}/${T.length}`,
      hallazgo: `${T.length - dentroRto.length} restauración(es) excedieron el RTO comprometido.`,
    }),
    indicador({
      id: 'RES-06',
      nombre: 'Tiempo medio de restauración',
      control: 'A.5.30',
      unidad: 'min',
      valor: mttr,
      meta: MTTR_OBJETIVO_MIN,
      direccion: 'bajar',
      formula: `suma de tiempos de restauración ÷ número de restauraciones = ${mttr ?? 's/d'} min sobre ${T.length} evento(s)`,
      hallazgo: `El tiempo medio de restauración (${mttr} min) supera el objetivo de ${MTTR_OBJETIVO_MIN} min.`,
    }),
    indicador({
      id: 'RES-07',
      nombre: 'Respaldos con verificación de integridad',
      control: 'A.8.13',
      unidad: '%',
      valor: porcentaje(integras.length, R.length),
      meta: 100,
      formula: `respaldos con integridad verificada ÷ respaldos ejecutados × 100 = ${integras.length}/${R.length}`,
      hallazgo: `${R.length - integras.length} respaldo(s) sin verificación de integridad.`,
    }),
  ];

  const pendiente = (w: VentanaConEstado) => w.estado === 'EN_CURSO' || w.estado === 'VENCIDA';
  return {
    indicadores,
    calendario,
    pendientes: {
      ejecucion: ventanasEjec.filter(pendiente).length,
      prueba: ventanasPrueba.filter(pendiente).length,
    },
  };
}
