import { calcularCambios, cambiosDeCreacion } from './cambios.js';

describe('calcularCambios', () => {
  const actual = {
    nombre: 'Servidor BD',
    ubicacion: 'Sala 1',
    cifrado: false,
    ultimaRevision: new Date('2026-01-10T00:00:00.000Z'),
  };

  it('devuelve solo los campos que cambian, con antes y después', () => {
    expect(
      calcularCambios(actual, { nombre: 'Servidor BD', ubicacion: 'Sala 2' }),
    ).toEqual({ ubicacion: { antes: 'Sala 1', despues: 'Sala 2' } });
  });

  it('ignora los campos no enviados (undefined)', () => {
    expect(calcularCambios(actual, { ubicacion: undefined })).toEqual({});
  });

  it('detecta cambios en booleanos, incluido a false', () => {
    expect(
      calcularCambios({ ...actual, cifrado: true }, { cifrado: false }),
    ).toEqual({ cifrado: { antes: true, despues: false } });
  });

  it('compara fechas por valor y las guarda en ISO', () => {
    expect(
      calcularCambios(actual, {
        ultimaRevision: new Date('2026-01-10T00:00:00.000Z'),
      }),
    ).toEqual({});
    expect(
      calcularCambios(actual, {
        ultimaRevision: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).toEqual({
      ultimaRevision: {
        antes: '2026-01-10T00:00:00.000Z',
        despues: '2026-02-01T00:00:00.000Z',
      },
    });
  });
});

describe('cambiosDeCreacion', () => {
  it('registra cada campo inicial con antes = null', () => {
    expect(cambiosDeCreacion({ codigo: 'SRV-001', cifrado: true })).toEqual({
      codigo: { antes: null, despues: 'SRV-001' },
      cifrado: { antes: null, despues: true },
    });
  });
});
