import type { Capa, EstadoEvento, EventoAgendaDto } from '../../common/dto/agenda.dto.js';
import type { ActivoBreveDto } from '../../common/dto/registro.dto.js';
import { diaLocal, instanteLocal } from '../../common/plazos/plazos.js';
import { dia } from '../../common/indicadores/indicador.js';
import type { VentanaRespaldo } from '../../generated/prisma/enums.js';
import { MOTIVOS_PRUEBA } from '../tablero/tablero.js';
import { estadoVentana, ventanasDe, type FrecuenciaVentana } from '../tablero/ventanas.js';
import { TEXTO_VENTANA } from './ventana-horaria.js';

/**
 * Agenda de respaldos en sus tres capas. Función pura. Eventos DISTINTOS para
 * lo previsto y lo real:
 *   1 Planificación: ventanas previstas de cada plan (día y hora de su ventana).
 *   2 Ejecución: ventanas aún pendientes (previsto) y las ejecuciones (real).
 *   3 Restauración: pruebas previstas (ventanas de prueba del plan y pruebas
 *     programadas sobre una copia) y las restauraciones registradas (real).
 * Una ventana se cumple con cualquier ejecución registrada en ella, igual que
 * en el tablero (el resultado se ve en la propia ejecución).
 */

/** Inicio y fin, en minutos locales, de cada ventana horaria (el fin puede caer al día siguiente). */
const HORARIO: Record<VentanaRespaldo, { ini: number; fin: number; diaSiguiente: boolean }> = {
  NOCTURNA_22_02: { ini: 22 * 60, fin: 2 * 60, diaSiguiente: true },
  NOCTURNA_00_04: { ini: 0, fin: 4 * 60, diaSiguiente: false },
  HORARIO_LABORAL: { ini: 8 * 60, fin: 18 * 60, diaSiguiente: false },
  FIN_DE_SEMANA: { ini: 0, fin: 24 * 60 - 1, diaSiguiente: false },
  CONTINUA: { ini: 0, fin: 24 * 60 - 1, diaSiguiente: false },
};

const siguienteDia = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const folio = (pre: string, id: number) => `${pre}-${String(id).padStart(4, '0')}`;
const ESTADO_VENTANA: Record<string, EstadoEvento> = { CUMPLIDA: 'COMPLETADO', VENCIDA: 'VENCIDO', EN_CURSO: 'EN_CURSO', PROGRAMADA: 'PROGRAMADO' };

export interface PlanAgendaRespaldo {
  id: number;
  frecuencia: string;
  frecuenciaPrueba: string;
  ventana: VentanaRespaldo;
  vigenteDesde: Date;
  responsable: string;
  activo: ActivoBreveDto;
}
export interface EjecucionAgenda {
  id: number;
  planId: number;
  fecha: Date;
  duracionMin: number;
  resultado: 'EXITOSO' | 'PARCIAL' | 'FALLIDO';
  responsable: string;
  fueraDePlazo: boolean;
  pruebaPrevista: Date | null;
  pruebaLimite: Date | null;
  activo: ActivoBreveDto;
}
export interface RestauracionAgenda {
  id: number;
  ejecucionId: number;
  fecha: Date;
  tiempoRealMin: number;
  resultado: 'EXITOSO' | 'PARCIAL' | 'FALLIDO';
  motivo: string;
  responsable: string;
  fueraDePlazo: boolean;
  activo: ActivoBreveDto;
}

export function agendaRespaldos(d: {
  planes: PlanAgendaRespaldo[];
  ejecuciones: EjecucionAgenda[];
  restauraciones: RestauracionAgenda[];
  desde: Date;
  hasta: Date;
  ahora: Date;
  capa?: Capa;
  zona?: string;
}): EventoAgendaDto[] {
  const quiere = (c: Capa) => !d.capa || d.capa === c;
  const eventos: EventoAgendaDto[] = [];
  const hoy = diaLocal(d.ahora, d.zona);
  const periodo = { ini: diaLocal(d.desde, d.zona), fin: diaLocal(d.hasta, d.zona) };
  const intervalo = (ventana: VentanaRespaldo, ini: string, fin: string) => {
    const h = HORARIO[ventana];
    return { inicio: instanteLocal(ini, h.ini, d.zona), fin: instanteLocal(h.diaSiguiente ? siguienteDia(fin) : fin, h.fin, d.zona) };
  };

  for (const p of d.planes) {
    // vigenteDesde es un día de calendario (guardado a medianoche UTC): se lee tal cual, sin zona.
    const desdePlan = dia(p.vigenteDesde);
    const ejecuciones = d.ejecuciones.filter((e) => e.planId === p.id);
    const fechasEjec = ejecuciones.map((e) => diaLocal(e.fecha, d.zona));
    const base = { modulo: 'respaldos' as const, activo: p.activo, responsable: p.responsable, fueraDePlazo: false };
    for (const w of ventanasDe(p.frecuencia as FrecuenciaVentana, desdePlan, periodo, hoy)) {
      const estado = ESTADO_VENTANA[estadoVentana(w, fechasEjec, hoy)];
      const { inicio, fin } = intervalo(p.ventana, w.ini, w.fin);
      const detalle = `${folio('PLN', p.id)} · ventana ${TEXTO_VENTANA[p.ventana]} · ${w.etiqueta}`;
      if (quiere(1)) {
        eventos.push({ ...base, clave: `r1-${p.id}-${w.ini}`, capa: 1, tipo: 'PREVISTO', titulo: `Respaldo previsto · ${p.activo.codigo}`, inicio, fin, estado, ruta: '/respaldos?paso=plan', detalle });
      }
      // Capa 2: solo las ventanas aún sin ejecución (lo pendiente); las cumplidas se ven por su ejecución real.
      if (quiere(2) && estado !== 'COMPLETADO') {
        eventos.push({ ...base, clave: `r2p-${p.id}-${w.ini}`, capa: 2, tipo: 'PREVISTO', titulo: `Pendiente: respaldo de ${p.activo.codigo}`, inicio, fin, estado, ruta: '/respaldos?paso=ejecucion', detalle });
      }
    }
    if (quiere(3)) {
      // Igual que el tablero (RES-04): cuentan las pruebas programadas y las verificaciones de integridad.
      const pruebas = d.restauraciones
        .filter((r) => MOTIVOS_PRUEBA.includes(r.motivo) && ejecuciones.some((e) => e.id === r.ejecucionId))
        .map((r) => diaLocal(r.fecha, d.zona));
      for (const w of ventanasDe(p.frecuenciaPrueba as FrecuenciaVentana, desdePlan, periodo, hoy)) {
        const estado = ESTADO_VENTANA[estadoVentana(w, pruebas, hoy)];
        eventos.push({ ...base, clave: `r3v-${p.id}-${w.ini}`, capa: 3, tipo: 'PREVISTO', titulo: `Ventana de prueba · ${p.activo.codigo}`, inicio: instanteLocal(w.ini, 0, d.zona), fin: instanteLocal(w.fin, 24 * 60 - 1, d.zona), estado, ruta: '/respaldos?paso=restauracion', detalle: `${folio('PLN', p.id)} · prueba ${p.frecuenciaPrueba.toLowerCase()} · ${w.etiqueta}` });
      }
    }
  }

  for (const e of d.ejecuciones) {
    const base = { modulo: 'respaldos' as const, activo: e.activo, responsable: e.responsable };
    if (quiere(2)) {
      const estado: EstadoEvento = e.resultado === 'EXITOSO' ? 'COMPLETADO' : 'FALLIDO';
      eventos.push({ ...base, clave: `r2r-${e.id}`, capa: 2, tipo: 'REAL', titulo: `Respaldo ${e.resultado.toLowerCase()} · ${e.activo.codigo}`, inicio: e.fecha, fin: new Date(e.fecha.getTime() + e.duracionMin * 60_000), estado, fueraDePlazo: e.fueraDePlazo, ruta: '/respaldos?paso=ejecucion', detalle: folio('RES', e.id) });
    }
    // Capa 3: la prueba programada de esta copia, mientras no se haya hecho.
    if (quiere(3) && e.pruebaPrevista) {
      const hecha = d.restauraciones.some((r) => r.ejecucionId === e.id && r.motivo === 'PRUEBA_PROGRAMADA');
      if (!hecha) {
        const vencida = (e.pruebaLimite ?? e.pruebaPrevista) < d.ahora;
        eventos.push({ ...base, clave: `r3p-${e.id}`, capa: 3, tipo: 'PREVISTO', titulo: `Probar restauración de ${folio('RES', e.id)}`, inicio: e.pruebaPrevista, fin: e.pruebaLimite, estado: vencida ? 'VENCIDO' : 'PROGRAMADO', fueraDePlazo: false, ruta: '/respaldos?paso=restauracion', detalle: `Copia del ${diaLocal(e.fecha, d.zona)}` });
      }
    }
  }

  if (quiere(3)) {
    for (const r of d.restauraciones) {
      eventos.push({ modulo: 'respaldos', clave: `r3r-${r.id}`, capa: 3, tipo: 'REAL', titulo: `Restauración ${r.resultado.toLowerCase()} · ${r.activo.codigo}`, inicio: r.fecha, fin: new Date(r.fecha.getTime() + r.tiempoRealMin * 60_000), estado: r.resultado === 'EXITOSO' ? 'COMPLETADO' : 'FALLIDO', fueraDePlazo: r.fueraDePlazo, responsable: r.responsable, activo: r.activo, ruta: '/respaldos?paso=restauracion', detalle: `${folio('RST', r.id)} · ${r.motivo.replace(/_/g, ' ').toLowerCase()} · de ${folio('RES', r.ejecucionId)}` });
    }
  }

  return eventos
    .filter((e) => e.inicio <= d.hasta && (e.fin ?? e.inicio) >= d.desde)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
