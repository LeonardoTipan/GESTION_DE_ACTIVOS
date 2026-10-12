import { mapearActivo } from './mapeo.js';
import { planificar, type ActivoLocal } from './plan.js';

const ZONA = 'America/Guayaquil';
const AHORA = new Date('2026-10-12T15:00:00.000Z');

/** Forma de la API v2: los campos relacionados llegan como { id, name }. */
const equipo = {
  id: 7,
  name: 'PC-CONTABILIDAD-01',
  otherserial: 'INV-0042',
  serial: 'SN123',
  user: { id: 12, name: 'jperez' },
  contact: 'jperez@WKS',
  location: { id: 3, name: 'Piso 2', completename: 'Matriz &#62; Piso 2' },
  model: { id: 5, name: 'Latitude 5420' },
  type: { id: 1, name: 'Laptop' },
  date_mod: '2026-10-01 09:30:00',
  is_deleted: false,
  is_template: false,
};

describe('mapearActivo', () => {
  it('Computer completo: n.º de inventario, objetos anidados y fecha en UTC', () => {
    const activo = mapearActivo('Computer', equipo, ZONA, AHORA);
    expect(activo).toMatchObject({
      itemtype: 'Computer',
      glpiId: 7,
      codigo: 'INV-0042',
      codigoDeInventario: true,
      excluido: undefined,
      datos: {
        nombre: 'PC-CONTABILIDAD-01',
        sistemas: 'Latitude 5420',
        custodio: 'jperez',
        ubicacion: 'Matriz > Piso 2',
      },
      avisos: [],
    });
    expect(activo.alCrear.ultimaRevision.toISOString()).toBe('2026-10-01T14:30:00.000Z');
  });

  it('custodio: usuario → contacto → técnico', () => {
    const sinUsuario = { ...equipo, user: null };
    expect(mapearActivo('Computer', sinUsuario, ZONA, AHORA).datos.custodio).toBe('jperez@WKS');
    const soloTecnico = { ...sinUsuario, contact: '', user_tech: { id: 2, name: 'soporte' } };
    expect(mapearActivo('Computer', soloTecnico, ZONA, AHORA).datos.custodio).toBe('soporte');
  });

  it('sin n.º de inventario genera un código estable y avisa', () => {
    const activo = mapearActivo(
      'NetworkEquipment',
      { id: 3, name: 'SW-CORE', otherserial: '', model: { id: 1, name: 'Catalyst 9300' } },
      ZONA,
      AHORA,
    );
    expect(activo.codigo).toBe('GLPI-RED-3');
    expect(activo.codigoDeInventario).toBe(false);
    expect(activo.datos.sistemas).toBe('Catalyst 9300');
    expect(activo.avisos.join('\n')).toContain('sin n.º de inventario');
  });

  it('campos vacíos: relleno solo para altas, con constancia', () => {
    const activo = mapearActivo(
      'Software',
      { id: 9, name: 'LibreOffice', user: null, location: { id: 0, name: '' } },
      ZONA,
      AHORA,
    );
    // `datos` solo lleva lo que GLPI informa: nada vacío pisará un dato local.
    expect(activo.datos).toEqual({ nombre: 'LibreOffice' });
    expect(activo.alCrear).toMatchObject({
      nombre: 'LibreOffice',
      sistemas: 'No especificado',
      custodio: 'Sin asignar',
      ubicacion: 'Sin ubicación',
      cifrado: false,
      ultimaRevision: AHORA,
    });
    expect(activo.avisos).toHaveLength(5); // codigo, sistemas, custodio, ubicacion, fecha
  });

  it('trunca los textos de más de 191 caracteres y lo deja en los avisos', () => {
    const activo = mapearActivo(
      'Computer',
      { ...equipo, name: 'N'.repeat(250), location: { id: 1, name: 'U'.repeat(200) } },
      ZONA,
      AHORA,
    );
    expect(Array.from(activo.datos.nombre!)).toHaveLength(191);
    expect(Array.from(activo.datos.ubicacion!)).toHaveLength(191);
    expect(activo.avisos).toContain('nombre: truncado de 250 a 191 caracteres');
    expect(activo.avisos).toContain('ubicacion: truncado de 200 a 191 caracteres');
  });

  it('marca como excluidos la papelera y las plantillas de GLPI', () => {
    expect(mapearActivo('Computer', { ...equipo, is_deleted: true }, ZONA, AHORA).excluido).toContain('papelera');
    expect(mapearActivo('Computer', { ...equipo, is_template: true }, ZONA, AHORA).excluido).toContain('plantilla');
  });
});

describe('mapearActivo · respuesta real de la API v2.2', () => {
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

  it('otherserial es el código; los objetos anidados dan su .name; sin avisos', () => {
    const activo = mapearActivo('Computer', real, ZONA, AHORA);
    expect(activo).toMatchObject({
      glpiId: 1,
      codigo: '001',
      codigoDeInventario: true,
      excluido: undefined,
      datos: {
        nombre: 'LAPTOP',
        sistemas: 'Windows 11 Pro',
        custodio: 'jpacha',
        ubicacion: 'TICs',
        numeroSerie: '00330-80000-00000-AA990',
        estado: 'Bueno',
        fabricante: 'ASUSTeK COMPUTER INC.',
      },
      avisos: [],
    });
  });

  it('comment se guarda completo, conservando sus saltos de línea', () => {
    const activo = mapearActivo('Computer', real, ZONA, AHORA);
    expect(activo.datos.comentario).toBe(
      'Memoria RAM 64 GB\nCapacidad de Disco 1T\nSistema Operativo Windows 11 Pro\nIncluye cargador\nQUITO TURISMO: 7-1-22-177',
    );
    expect(activo.alCrear).toMatchObject({
      numeroSerie: '00330-80000-00000-AA990',
      estado: 'Bueno',
      fabricante: 'ASUSTeK COMPUTER INC.',
      comentario: activo.datos.comentario,
    });
  });

  it('los datos técnicos son opcionales: si GLPI no los trae, ni se guardan ni se avisa', () => {
    const activo = mapearActivo(
      'Computer',
      { ...real, serial: '', status: null, manufacturer: { id: 0, name: '' }, comment: '\r\n' },
      ZONA,
      AHORA,
    );
    expect(activo.datos).toEqual({
      nombre: 'LAPTOP',
      sistemas: 'ROG Zephyrus M16 GU604VI_GU604VI',
      custodio: 'jpacha',
      ubicacion: 'TICs',
    });
    expect(activo.avisos).toEqual([]);
  });

  it('un comentario enorme se recorta a 5000 caracteres, con constancia', () => {
    const activo = mapearActivo('Computer', { ...real, comment: 'x'.repeat(6000) }, ZONA, AHORA);
    expect(activo.datos.comentario).toHaveLength(5000);
    expect(activo.avisos).toContain('comentario: truncado de 6000 a 5000 caracteres');
  });

  it('date_mod con desfase -05:00 se guarda en UTC', () => {
    const activo = mapearActivo('Computer', real, ZONA, AHORA);
    expect(activo.alCrear.ultimaRevision.toISOString()).toBe('2026-05-14T15:02:24.000Z');
  });

  it('sin date_mod usa date_creation', () => {
    const activo = mapearActivo('Computer', { ...real, date_mod: null }, ZONA, AHORA);
    expect(activo.alCrear.ultimaRevision.toISOString()).toBe('2026-05-11T18:56:57.000Z');
  });

  it('si el comentario no anota el SO, "sistemas" es el modelo', () => {
    const activo = mapearActivo('Computer', { ...real, comment: 'Incluye cargador\r\n' }, ZONA, AHORA);
    expect(activo.datos.sistemas).toBe('ROG Zephyrus M16 GU604VI_GU604VI');
  });
});

describe('planificar', () => {
  const glpi = mapearActivo('Computer', equipo, ZONA, AHORA);
  const local: ActivoLocal = {
    id: 15,
    codigo: 'INV-0042',
    nombre: 'PC-CONTABILIDAD-01',
    sistemas: 'Latitude 5420',
    custodio: 'jperez',
    ubicacion: 'Matriz > Piso 2',
    cifrado: true,
    numeroSerie: 'SN123',
    estado: null,
    fabricante: null,
    comentario: null,
    deletedAt: null,
    enlazadoConGlpi: true,
  };

  it('no existe en local → CREAR', () => {
    expect(planificar(glpi, null).accion).toBe('CREAR');
  });

  it('registrado a mano con el mismo código → ENLAZAR con las diferencias', () => {
    const plan = planificar(glpi, {
      ...local,
      enlazadoConGlpi: false,
      custodio: 'Juan Pérez',
    });
    expect(plan.accion).toBe('ENLAZAR');
    expect(plan.diferencias).toEqual({
      custodio: { antes: 'Juan Pérez', despues: 'jperez' },
    });
  });

  it('ya enlazado e igual → SIN_CAMBIOS; con cambios → ACTUALIZAR', () => {
    expect(planificar(glpi, local).accion).toBe('SIN_CAMBIOS');
    const plan = planificar(glpi, { ...local, ubicacion: 'Bodega' });
    expect(plan.accion).toBe('ACTUALIZAR');
    expect(Object.keys(plan.diferencias)).toEqual(['ubicacion']);
  });

  it('nunca toca el cifrado local (GLPI no lo informa) ni pisa con campos vacíos', () => {
    const sinModelo = mapearActivo('Computer', { ...equipo, model: null, type: null }, ZONA, AHORA);
    expect(sinModelo.datos.sistemas).toBeUndefined();
    expect(planificar(sinModelo, { ...local, sistemas: 'Windows 11' }).accion).toBe('SIN_CAMBIOS');
  });

  it('dado de baja en local → OMITIR (no se reactiva)', () => {
    expect(planificar(glpi, { ...local, deletedAt: new Date() }).accion).toBe('OMITIR');
  });
});
