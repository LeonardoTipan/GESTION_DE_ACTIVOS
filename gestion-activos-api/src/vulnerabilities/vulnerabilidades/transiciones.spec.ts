import type { EstadoVulnerabilidad } from '../../generated/prisma/enums.js';
import { agendaVulnerabilidades } from './agenda.js';
import { exigirCierre, exigirFechaRemediacion, exigirInicio } from './reglas.js';
import { estaVencida, puedeTransicionar, TRANSICIONES, type AccionVulnerabilidad } from './transiciones.js';

const ESTADOS: EstadoVulnerabilidad[] = ['ABIERTO', 'EN_PROGRESO', 'REMEDIADO'];
const d = (s: string) => new Date(s);

describe('vulnerabilidades: dos fases (Detección y Remediación)', () => {
  it('transiciones permitidas', () => {
    const permitidas = (accion: AccionVulnerabilidad) => ESTADOS.filter((e) => puedeTransicionar(e, accion));
    expect(permitidas('iniciar')).toEqual(['ABIERTO']);
    expect(permitidas('remediar')).toEqual(['ABIERTO', 'EN_PROGRESO']);
    expect(permitidas('reabrir')).toEqual(['REMEDIADO']);
    expect(TRANSICIONES.reabrir.hacia).toBe('EN_PROGRESO');
  });

  it('vencida: pendiente con el plazo pasado; una remediada nunca', () => {
    const ahora = d('2026-05-01T00:00:00Z');
    const limite = d('2026-04-30T00:00:00Z');
    expect(estaVencida({ estado: 'ABIERTO', fechaLimite: limite }, ahora)).toBe(true);
    expect(estaVencida({ estado: 'EN_PROGRESO', fechaLimite: null }, ahora)).toBe(false);
    expect(estaVencida({ estado: 'REMEDIADO', fechaLimite: limite }, ahora)).toBe(false);
  });

  it('fecha de remediación: histórica válida; no futura ni anterior a la detección', () => {
    const deteccion = d('2026-01-25T14:00:00Z');
    const ahora = d('2026-04-30T15:00:00Z');
    expect(() => exigirFechaRemediacion(deteccion, d('2026-04-27T15:00:00Z'), ahora)).not.toThrow();
    expect(() => exigirFechaRemediacion(deteccion, d('2026-05-02T15:00:00Z'), ahora)).toThrow(/futura/);
    expect(() => exigirFechaRemediacion(deteccion, d('2026-01-20T15:00:00Z'), ahora)).toThrow(/anterior a la fecha de detección/);
    expect(() => exigirInicio(deteccion, d('2026-01-01T00:00:00Z'))).toThrow(/anterior/);
  });

  it('cierre: exige fecha, verificable y repositorio válido', () => {
    const deteccion = d('2026-01-25T14:00:00Z');
    const ahora = d('2026-04-30T15:00:00Z');
    const completo = { fechaRemediacion: d('2026-04-27T15:00:00Z'), evidencia: 'Informe 01', repositorioVerificable: 'Carpeta XXXXX' };
    expect(() => exigirCierre(deteccion, completo, ahora)).not.toThrow();
    expect(() => exigirCierre(deteccion, { ...completo, fechaRemediacion: null }, ahora)).toThrow(/falta la fecha de remediación/);
    expect(() => exigirCierre(deteccion, { ...completo, evidencia: '  ' }, ahora)).toThrow(/falta el verificable/);
    expect(() => exigirCierre(deteccion, { ...completo, repositorioVerificable: null }, ahora)).toThrow(/repositorio/);
    expect(() => exigirCierre(deteccion, { ...completo, repositorioVerificable: 'javascript:alert(1)' }, ahora)).toThrow(/http o https/);
  });

  it('agenda: solo dos capas; la remediación usa la fecha real', () => {
    const activo = { id: 1, codigo: 'SRV-01', nombre: 'Servidor', tipo: null, estado: 'Bueno', criticidad: 'Alta', categoria: 'Computadoras', categoriaId: 1 };
    const base = { id: 1, cve: null, nivelRiesgo: 'ALTO', fecha: d('2026-01-25T14:00:00Z'), fechaLimite: d('2026-04-30T00:00:00Z'), tratamientoIniciadoEn: null, responsable: 'ANALISTA 1', activo };
    const remediada = { ...base, estado: 'REMEDIADO' as const, fechaRemediacion: d('2026-04-27T15:00:00Z') };
    const rango = { desde: d('2026-01-01T00:00:00Z'), hasta: d('2026-12-31T00:00:00Z'), ahora: d('2026-04-30T15:00:00Z') };
    const eventos = agendaVulnerabilidades({ ...rango, vulnerabilidades: [remediada] });
    expect(eventos.every((e) => e.capa === 1 || e.capa === 2)).toBe(true);
    expect(eventos.find((e) => e.clave === 'v2r-1')).toMatchObject({ inicio: remediada.fechaRemediacion, estado: 'COMPLETADO', fueraDePlazo: false });
    expect(agendaVulnerabilidades({ ...rango, vulnerabilidades: [remediada], capa: 3 })).toEqual([]);
  });
});
