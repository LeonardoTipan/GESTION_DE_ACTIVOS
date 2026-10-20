import { extraerCodigoInstitucional, mapearActivo } from './mapeo.js';
import { ordenador, REGLA } from './testing/inventario-ejemplo.js';

const ZONA = 'America/Guayaquil';
const AHORA = new Date('2026-10-12T15:00:00.000Z');
const SIN_REGLA = { etiqueta: '', formato: REGLA.formato };

/** GET /api.php/v2/Assets/Computer?start=0&limit=1 del GLPI de la empresa. */
const real = {
  id: 1,
  name: 'LAPTOP ',
  comment:
    'Memoria RAM 64 GB\r\nCapacidad de Disco 1T\r\nSistema Operativo Windows 11 Pro\r\nIncluye cargador \r\nQUITO TURISMO: 7-1-22-177\r\n',
  is_recursive: false,
  contact: 'PasanteTIC',
  contact_num: '',
  serial: '00330-80000-00000-AA990',
  otherserial: '001',
  is_deleted: false,
  date_creation: '2026-05-11T13:56:57-05:00',
  date_mod: '2026-05-14T10:02:24-05:00',
  uuid: '',
  status: { id: 3, name: 'Bueno' },
  entity: { id: 0, name: 'Entidad Raíz' },
  manufacturer: { id: 1, name: 'ASUSTeK COMPUTER INC.' },
  user: { id: 30, name: 'jpacha' },
  user_tech: { id: 114, name: 'pasantetic' },
  location: { id: 11, name: 'TICs' },
  type: { id: 2, name: 'Laptop' },
  model: { id: 1, name: 'ROG Zephyrus M16 GU604VI_GU604VI' },
  group: [],
  group_tech: [],
  network: { id: 2, name: 'SI' },
  autoupdatesystem: null,
};

const mapear = (item: typeof real | Record<string, unknown>, tipo = 'Computer' as const) =>
  mapearActivo(tipo, item as never, ZONA, REGLA, AHORA);

describe('mapearActivo · respuesta real de la API v2.2', () => {
  it('la identidad es el tipo + id de GLPI, no el n.º de inventario', () => {
    expect(mapear(real)).toMatchObject({
      referencia: 'Computer #1',
      codigoRespaldo: 'GLPI-PC-1',
    });
    // Mismo id en otro tipo = otro elemento distinto.
    expect(mapearActivo('NetworkEquipment', real, ZONA, REGLA, AHORA)).toMatchObject({
      referencia: 'NetworkEquipment #1',
      codigoRespaldo: 'GLPI-RED-1',
    });
  });

  it('todos los campos se toman de GLPI (los anidados, por su .name); sin avisos', () => {
    const activo = mapear(real);
    expect(activo.datos).toMatchObject({
      nombre: 'LAPTOP',
      sistemas: 'Windows 11 Pro',
      custodio: 'jpacha',
      ubicacion: 'TICs',
      numeroInventario: '001',
      codigoInstitucional: '7-1-22-177',
      numeroSerie: '00330-80000-00000-AA990',
      estado: 'Bueno',
      fabricante: 'ASUSTeK COMPUTER INC.',
      tipo: 'Laptop',
      modelo: 'ROG Zephyrus M16 GU604VI_GU604VI',
      tecnicoResponsable: 'pasantetic',
      red: 'SI',
      contacto: 'PasanteTIC',
    });
    expect(activo.avisos).toEqual([]);
    expect(activo.revision).toEqual([]);
  });

  it('candidatos a código: primero el institucional, después el n.º de inventario', () => {
    expect(mapear(real).candidatos).toEqual([
      { origen: 'institucional', valor: '7-1-22-177' },
      { origen: 'inventario', valor: '001' },
    ]);
  });

  it('fecha con desplazamiento -05:00: se conserva el instante exacto en UTC', () => {
    const activo = mapear(real);
    // 13:56:57 en UTC−5 = 18:56:57 UTC (mismo día 11, no cambia de fecha).
    expect(activo.datos.fechaAlta?.toISOString()).toBe('2026-05-11T18:56:57.000Z');
    expect(activo.alCrear.ultimaRevision.toISOString()).toBe('2026-05-14T15:02:24.000Z');
  });

  it('una fecha de las 23:30 local cae en el día siguiente en UTC, pero es el mismo instante', () => {
    const activo = mapear({ ...real, date_creation: '2026-05-11T23:30:00-05:00' });
    const fecha = activo.datos.fechaAlta!;
    expect(fecha.toISOString()).toBe('2026-05-12T04:30:00.000Z');
    // Mostrada en la zona de la institución vuelve a ser el día 11.
    expect(
      new Intl.DateTimeFormat('es', { timeZone: ZONA, day: 'numeric' }).format(fecha),
    ).toBe('11');
  });

  it('comment se guarda completo, conservando sus saltos de línea', () => {
    expect(mapear(real).datos.comentario).toBe(
      'Memoria RAM 64 GB\nCapacidad de Disco 1T\nSistema Operativo Windows 11 Pro\nIncluye cargador\nQUITO TURISMO: 7-1-22-177',
    );
  });

  it('datos opcionales ausentes: no se inventan valores', () => {
    const activo = mapear({
      id: 9,
      name: 'Equipo sin datos',
      otherserial: '',
      serial: '',
      comment: null,
      status: null,
      manufacturer: { id: 0, name: '' },
      type: null,
      model: null,
      user: null,
      user_tech: null,
      network: null,
      contact: '',
      location: null,
      date_creation: null,
      date_mod: null,
    });
    // `datos` solo lleva lo que GLPI informa: nada vacío pisará un dato local.
    expect(activo.datos).toEqual({ nombre: 'Equipo sin datos' });
    expect(activo.candidatos).toEqual([]);
    // Los campos obligatorios de un alta reciben un relleno explícito, con constancia.
    expect(activo.alCrear).toMatchObject({
      sistemas: 'No especificado',
      custodio: 'Sin asignar',
      ubicacion: 'Sin ubicación',
      cifrado: false,
      ultimaRevision: AHORA,
    });
    expect(activo.alCrear.numeroSerie).toBeUndefined();
    expect(activo.alCrear.fechaAlta).toBeUndefined();
    expect(activo.avisos).toHaveLength(4); // sistemas, custodio, ubicacion, fecha
  });

  it('trunca los textos de más de 191 caracteres y lo deja en los avisos', () => {
    const activo = mapear({ ...real, name: 'N'.repeat(250), location: { id: 1, name: 'U'.repeat(200) } });
    expect(Array.from(activo.datos.nombre!)).toHaveLength(191);
    expect(activo.avisos).toContain('nombre: truncado de 250 a 191 caracteres');
    expect(activo.avisos).toContain('ubicacion: truncado de 200 a 191 caracteres');
  });

  it('un comentario enorme se recorta a 5000 caracteres, con constancia', () => {
    const activo = mapear({ ...real, comment: 'x'.repeat(6000) });
    expect(activo.datos.comentario).toHaveLength(5000);
    expect(activo.avisos).toContain('comentario: truncado de 6000 a 5000 caracteres');
  });

  it('las plantillas se excluyen; la papelera se conserva, marcada y sin disputar códigos', () => {
    expect(mapear({ ...real, is_template: true }).excluido).toContain('plantilla');
    const enPapelera = mapear({ ...real, is_deleted: true });
    expect(enPapelera.excluido).toBeUndefined();
    expect(enPapelera.enPapelera).toBe(true);
    expect(enPapelera.candidatos).toEqual([]);
    expect(mapear(real).enPapelera).toBe(false);
  });

  it('custodio: usuario → contacto → técnico', () => {
    expect(mapear({ ...real, user: null }).datos.custodio).toBe('PasanteTIC');
    expect(mapear({ ...real, user: null, contact: '' }).datos.custodio).toBe('pasantetic');
  });
});

describe('código institucional', () => {
  it('se extrae del comentario tal cual está escrito', () => {
    expect(extraerCodigoInstitucional('RAM 8 GB\r\nQUITO TURISMO: 7-1-22-177\r\n', 'QUITO TURISMO')).toBe('7-1-22-177');
    expect(extraerCodigoInstitucional('quito  turismo 7-1-22-69', 'QUITO TURISMO')).toBe('7-1-22-69');
    expect(extraerCodigoInstitucional('Sin mención', 'QUITO TURISMO')).toBeNull();
    expect(extraerCodigoInstitucional(null, 'QUITO TURISMO')).toBeNull();
  });

  it('válido: se conserva y es candidato a código operativo', () => {
    const activo = mapear(ordenador(2, '001', '7-1-22-69'));
    expect(activo.datos.codigoInstitucional).toBe('7-1-22-69');
    expect(activo.candidatos[0]).toEqual({ origen: 'institucional', valor: '7-1-22-69' });
    expect(activo.revision).toEqual([]);
  });

  it('formato irregular: se conserva el ORIGINAL sin corregir, no es candidato y se informa', () => {
    for (const irregular of ['7-1722-47', '7-1-7-22--76']) {
      const activo = mapear(ordenador(23, '001', irregular));
      expect(activo.datos.codigoInstitucional).toBe(irregular);
      expect(activo.candidatos).toEqual([{ origen: 'inventario', valor: '001' }]);
      expect(activo.revision[0]).toContain(`"${irregular}" con formato irregular`);
    }
  });

  it('"S/N: 7-1-22-183" (prefijo + valor): se conserva ENTERO, no se interpreta ni se usa como código', () => {
    const activo = mapear(ordenador(6, '001', 'S/N: 7-1-22-183'));
    expect(activo.datos.codigoInstitucional).toBe('S/N: 7-1-22-183');
    expect(activo.candidatos).toEqual([{ origen: 'inventario', valor: '001' }]);
    expect(activo.revision[0]).toContain('"S/N: 7-1-22-183" con formato irregular');
  });

  it('"S/N" a secas: no se guarda como código, no es candidato y se informa', () => {
    const activo = mapear(ordenador(6, '001', 'S/N:'));
    expect(activo.datos.codigoInstitucional).toBeUndefined();
    expect(activo.candidatos).toEqual([{ origen: 'inventario', valor: '001' }]);
    expect(activo.revision[0]).toContain('sin número asignado');
  });

  it('comentario sin la etiqueta: se informa', () => {
    const activo = mapear(ordenador(4, '001', null));
    expect(activo.datos.codigoInstitucional).toBeUndefined();
    expect(activo.revision[0]).toContain('Sin código institucional');
  });

  it('sin etiqueta configurada no se busca ni se informa nada', () => {
    const activo = mapearActivo('Computer', real, ZONA, SIN_REGLA, AHORA);
    expect(activo.datos.codigoInstitucional).toBeUndefined();
    expect(activo.candidatos).toEqual([{ origen: 'inventario', valor: '001' }]);
    expect(activo.revision).toEqual([]);
  });

  it('el n.º de inventario original se guarda aparte del código operativo', () => {
    const activo = mapear(ordenador(5, '001', '7-1-22-185'));
    expect(activo.datos.numeroInventario).toBe('001');
    expect(activo.codigoRespaldo).toBe('GLPI-PC-5');
  });
});
