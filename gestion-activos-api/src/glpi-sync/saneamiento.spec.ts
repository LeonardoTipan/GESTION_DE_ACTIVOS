import {
  decodificarHtml,
  fechaGlpiAUtc,
  MAX_TEXTO,
  textoGlpi,
  truncar,
} from './saneamiento.js';

describe('truncar', () => {
  it('deja intactos los textos que caben', () => {
    const exacto = 'a'.repeat(MAX_TEXTO);
    expect(truncar(exacto)).toEqual({
      valor: exacto,
      truncado: false,
      longitudOriginal: 191,
    });
  });

  it('recorta a 191 caracteres y deja constancia', () => {
    const r = truncar('a'.repeat(300));
    expect(Array.from(r.valor)).toHaveLength(MAX_TEXTO);
    expect(r.valor.endsWith('…')).toBe(true);
    expect(r).toMatchObject({ truncado: true, longitudOriginal: 300 });
  });

  it('no parte un emoji por la mitad', () => {
    const r = truncar('😀'.repeat(200));
    expect(Array.from(r.valor)).toHaveLength(MAX_TEXTO);
    expect(() => encodeURIComponent(r.valor)).not.toThrow(); // sin medios emojis
  });
});

describe('textos de GLPI', () => {
  it('decodifica entidades HTML', () => {
    expect(decodificarHtml('Sede &#62; Piso 2 &amp; Anexo')).toBe(
      'Sede > Piso 2 & Anexo',
    );
  });

  it('trata como vacío lo que GLPI envía sin valor', () => {
    for (const vacio of [0, null, undefined, '', '  ', '0', '&nbsp;']) {
      expect(textoGlpi(vacio)).toBeNull();
    }
    expect(textoGlpi('  PC-001  ')).toBe('PC-001');
  });

  it('de un campo relacionado { id, name } toma el nombre (el completo si existe)', () => {
    expect(textoGlpi({ id: 3, name: 'jperez' })).toBe('jperez');
    expect(
      textoGlpi({ id: 3, name: 'Piso 2', completename: 'Matriz > Piso 2' }),
    ).toBe('Matriz > Piso 2');
    expect(textoGlpi({ id: 0, name: '' })).toBeNull();
  });
});

describe('fechaGlpiAUtc', () => {
  it('convierte la hora local del servidor GLPI a UTC (UTC−5)', () => {
    expect(
      fechaGlpiAUtc('2026-10-01 09:30:00', 'America/Guayaquil')?.toISOString(),
    ).toBe('2026-10-01T14:30:00.000Z');
  });

  it('no cambia de día por error: 23:30 local es el día siguiente en UTC', () => {
    expect(
      fechaGlpiAUtc('2026-10-01 23:30:00', 'America/Guayaquil')?.toISOString(),
    ).toBe('2026-10-02T04:30:00.000Z');
  });

  it('respeta el horario de verano de la zona', () => {
    // Madrid: UTC+1 en invierno, UTC+2 en verano.
    expect(
      fechaGlpiAUtc('2026-01-15 12:00:00', 'Europe/Madrid')?.toISOString(),
    ).toBe('2026-01-15T11:00:00.000Z');
    expect(
      fechaGlpiAUtc('2026-07-15 12:00:00', 'Europe/Madrid')?.toISOString(),
    ).toBe('2026-07-15T10:00:00.000Z');
  });

  it('con zona UTC no altera la hora', () => {
    expect(fechaGlpiAUtc('2026-10-01 09:30:00', 'UTC')?.toISOString()).toBe(
      '2026-10-01T09:30:00.000Z',
    );
  });

  it('si la fecha ya trae desfase (ISO 8601), no se le aplica la zona', () => {
    expect(
      fechaGlpiAUtc('2026-10-01T09:30:00-05:00', 'Europe/Madrid')?.toISOString(),
    ).toBe('2026-10-01T14:30:00.000Z');
    expect(
      fechaGlpiAUtc('2026-10-01T09:30:00Z', 'America/Guayaquil')?.toISOString(),
    ).toBe('2026-10-01T09:30:00.000Z');
  });

  it('acepta fechas sin hora', () => {
    expect(
      fechaGlpiAUtc('2026-10-01', 'America/Guayaquil')?.toISOString(),
    ).toBe('2026-10-01T05:00:00.000Z');
  });

  it('devuelve null con fechas vacías o inválidas', () => {
    for (const mala of [null, '', '0000-00-00 00:00:00', 'ayer', '2026-02-31 10:00:00', 0]) {
      expect(fechaGlpiAUtc(mala, 'America/Guayaquil')).toBeNull();
    }
  });
});
