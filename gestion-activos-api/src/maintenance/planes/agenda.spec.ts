import { agendaMantenimientos, type MantenimientoAgenda } from './agenda.js';

const activo = { id: 1, codigo: 'PC-1', nombre: 'PC', tipo: null, estado: 'Malo', criticidad: 'Media', categoria: 'Computadoras', categoriaId: 1 };
const d = (s: string) => new Date(s);
const base: MantenimientoAgenda = {
  id: 1, tipo: 'PREVENTIVO', fase: 'PROGRAMADO', actividad: 'Limpieza', fecha: d('2026-12-30T13:00:00Z'), fechaLimite: d('2027-01-02T22:00:00Z'),
  fechaInicio: null, fechaFin: null, tecnico: null, estadoEquipo: null, fueraDePlazo: false, verificacionPrevista: null, verificacionLimite: null, activo, verificaciones: [],
};
const rango = { desde: d('2026-12-01T00:00:00Z'), hasta: d('2027-01-31T23:59:59Z'), planes: [], verificaciones: [] };

describe('agenda de mantenimientos', () => {
  it('capa 1: el intervalo previsto cruza mes y año; vencido solo al pasar el límite', () => {
    const [e] = agendaMantenimientos({ ...rango, mantenimientos: [base], ahora: d('2027-01-01T00:00:00Z'), capa: 1 });
    expect(e).toMatchObject({ tipo: 'PREVISTO', capa: 1, estado: 'PROGRAMADO', inicio: base.fecha, fin: base.fechaLimite });
    const [v] = agendaMantenimientos({ ...rango, mantenimientos: [base], ahora: d('2027-01-03T00:00:00Z'), capa: 1 });
    expect(v.estado).toBe('VENCIDO');
  });

  it('capa 2: lo pendiente es PREVISTO; lo ejecutado, REAL con sus fechas reales (no las previstas)', () => {
    const hecho = { ...base, id: 2, fase: 'FINALIZADO' as const, fechaInicio: d('2027-01-05T15:00:00Z'), fechaFin: d('2027-01-05T17:00:00Z'), fueraDePlazo: true };
    const eventos = agendaMantenimientos({ ...rango, mantenimientos: [base, hecho], ahora: d('2027-01-10T00:00:00Z'), capa: 2 });
    expect(eventos.map((e) => [e.clave, e.tipo, e.estado])).toEqual([
      ['m2p-1', 'PREVISTO', 'VENCIDO'],
      ['m2r-2', 'REAL', 'COMPLETADO'],
    ]);
    expect(eventos[1]).toMatchObject({ inicio: hecho.fechaInicio, fin: hecho.fechaFin, fueraDePlazo: true });
  });

  it('capa 3: la verificación tiene su propia ventana; una verificación OPERATIVO la quita de pendientes', () => {
    const fin = { ...base, fase: 'FINALIZADO' as const, fechaFin: d('2027-01-05T17:00:00Z'), verificacionPrevista: d('2027-01-06T13:00:00Z'), verificacionLimite: d('2027-01-08T22:00:00Z') };
    const [p] = agendaMantenimientos({ ...rango, mantenimientos: [fin], ahora: d('2027-01-07T00:00:00Z'), capa: 3 });
    expect(p).toMatchObject({ tipo: 'PREVISTO', inicio: fin.verificacionPrevista, fin: fin.verificacionLimite, estado: 'PROGRAMADO' });
    const cerrado = { ...fin, verificaciones: [{ resultado: 'OPERATIVO', anuladoEn: null }] };
    expect(agendaMantenimientos({ ...rango, mantenimientos: [cerrado], ahora: d('2027-01-07T00:00:00Z'), capa: 3 })).toEqual([]);
  });

  it('capa 1: proyecta las próximas intervenciones de un plan según su frecuencia, dentro del rango', () => {
    const plan = { id: 7, tipo: 'PREVENTIVO', frecuencia: 'MENSUAL' as const, proximaFecha: d('2026-12-15T13:00:00Z'), plazoDias: 3, responsable: 'TIC', activo };
    const eventos = agendaMantenimientos({ ...rango, mantenimientos: [], planes: [plan], ahora: d('2026-12-01T00:00:00Z'), capa: 1 });
    expect(eventos.map((e) => e.inicio.toISOString().slice(0, 10))).toEqual(['2026-12-15', '2027-01-15']);
    expect(eventos[0].fin?.toISOString().slice(0, 10)).toBe('2026-12-18');
  });
});
