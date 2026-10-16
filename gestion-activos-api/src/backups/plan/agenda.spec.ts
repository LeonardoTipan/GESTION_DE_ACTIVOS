import { diaLocal, instanteLocal } from '../../common/plazos/plazos.js';
import { agendaRespaldos } from './agenda.js';
import { dentroDeVentana } from './ventana-horaria.js';

const Z = 'America/Guayaquil';
const activo = { id: 1, codigo: 'SRV-1', nombre: 'Servidor', tipo: null, estado: null, criticidad: 'Alta', categoria: 'Computadoras', categoriaId: 1 };
const d = (s: string) => new Date(s);
const plan = { id: 5, frecuencia: 'DIARIO', frecuenciaPrueba: 'MENSUAL', ventana: 'NOCTURNA_22_02' as const, vigenteDesde: d('2026-12-30T05:00:00Z'), responsable: 'Infra', activo };

describe('agenda de respaldos', () => {
  it('hora local: 22:30 en Quito es el mismo día local aunque en UTC ya sea el siguiente (y cruza el año)', () => {
    const real = d('2027-01-01T03:30:00Z');
    expect(diaLocal(real, Z)).toBe('2026-12-31');
    expect(dentroDeVentana('NOCTURNA_22_02', real, Z)).toBe(true);
    expect(dentroDeVentana('NOCTURNA_22_02', d('2026-12-31T20:00:00Z'), Z)).toBe(false);
    expect(instanteLocal('2026-12-31', 22 * 60, Z).toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('capa 1: cada ventana diaria va de las 22:00 a las 02:00 del día siguiente; la ejecución la cumple', () => {
    const ejecucion = { id: 9, planId: 5, fecha: d('2027-01-01T03:30:00Z'), duracionMin: 30, resultado: 'EXITOSO' as const, responsable: 'Infra', fueraDePlazo: false, pruebaPrevista: null, pruebaLimite: null, activo };
    const eventos = agendaRespaldos({ planes: [plan], ejecuciones: [ejecucion], restauraciones: [], desde: d('2026-12-31T05:00:00Z'), hasta: d('2027-01-01T04:59:59Z'), ahora: d('2027-01-02T12:00:00Z'), capa: 1, zona: Z });
    const del31 = eventos.find((e) => e.clave === 'r1-5-2026-12-31')!;
    expect(del31).toMatchObject({ tipo: 'PREVISTO', estado: 'COMPLETADO' });
    expect(del31.inicio.toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(del31.fin!.toISOString()).toBe('2027-01-01T07:00:00.000Z');
  });

  it('el inicio previsto del plan es un día de calendario: «1 de octubre» no empieza el 30 de septiembre en Guayaquil', () => {
    const desdeOctubre = { ...plan, vigenteDesde: d('2026-10-01T00:00:00Z') }; // así se guarda «2026-10-01»
    const eventos = agendaRespaldos({ planes: [desdeOctubre], ejecuciones: [], restauraciones: [], desde: d('2026-09-29T05:00:00Z'), hasta: d('2026-10-03T04:59:59Z'), ahora: d('2026-10-02T12:00:00Z'), capa: 1, zona: Z });
    expect(eventos.map((e) => e.clave)).toEqual(['r1-5-2026-10-01', 'r1-5-2026-10-02']);
  });

  it('capa 2 y 3: la ejecución es REAL; su prueba programada es un evento PREVISTO aparte, con su propio plazo', () => {
    const ejecucion = { id: 9, planId: 5, fecha: d('2027-01-01T03:30:00Z'), duracionMin: 30, resultado: 'EXITOSO' as const, responsable: 'Infra', fueraDePlazo: false, pruebaPrevista: d('2027-01-02T14:00:00Z'), pruebaLimite: d('2027-01-05T22:00:00Z'), activo };
    const datos = { planes: [], ejecuciones: [ejecucion], restauraciones: [], desde: d('2026-12-31T05:00:00Z'), hasta: d('2027-01-10T04:59:59Z'), ahora: d('2027-01-06T12:00:00Z'), zona: Z };
    expect(agendaRespaldos({ ...datos, capa: 2 }).map((e) => [e.tipo, e.estado])).toEqual([['REAL', 'COMPLETADO']]);
    expect(agendaRespaldos({ ...datos, capa: 3 })).toMatchObject([{ tipo: 'PREVISTO', estado: 'VENCIDO', inicio: ejecucion.pruebaPrevista, fin: ejecucion.pruebaLimite }]);
  });
});
