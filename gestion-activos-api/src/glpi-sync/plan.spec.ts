import { mapearActivo } from './mapeo.js';
import {
  planificar,
  type ActivoLocal,
  type CandidatoEvaluado,
  type Contexto,
} from './plan.js';
import { ordenador, REGLA } from './testing/inventario-ejemplo.js';

const glpi = mapearActivo(
  'Computer',
  ordenador(12, 'INV-12', '7-1-22-999'),
  'America/Guayaquil',
  REGLA,
  new Date('2026-10-12T15:00:00.000Z'),
);

/** Activo local que refleja exactamente lo que trae GLPI para ese elemento. */
const local = (extra: Partial<ActivoLocal> = {}): ActivoLocal => ({
  id: 50,
  codigo: 'COD-LOCAL',
  origenGlpi: null,
  cifrado: false,
  deletedAt: null,
  numeroInventario: null,
  codigoInstitucional: null,
  numeroSerie: null,
  estado: null,
  fabricante: null,
  comentario: null,
  tipo: null,
  modelo: null,
  tecnicoResponsable: null,
  red: null,
  contacto: null,
  fechaAlta: null,
  nombre: 'Laptop 12',
  sistemas: 'Windows 11 Pro',
  custodio: 'usuario12',
  ubicacion: 'TICs',
  ...glpi.datos,
  ...extra,
});

const candidato = (
  origen: CandidatoEvaluado['origen'],
  extra: Partial<CandidatoEvaluado> = {},
): CandidatoEvaluado => ({
  origen,
  valor: origen === 'institucional' ? '7-1-22-999' : 'INV-12',
  repetidoEn: [],
  conEseCodigo: null,
  manuales: [],
  ...extra,
});

const contexto = (extra: Partial<Contexto> = {}): Contexto => ({
  vinculado: null,
  candidatos: [candidato('institucional'), candidato('inventario')],
  conCodigoRespaldo: null,
  mejorarCodigoDeRespaldo: false,
  reservados: { codigos: new Map(), manuales: new Map() },
  ...extra,
});

describe('planificar · identidad', () => {
  it('ya vinculado por su referencia y sin cambios → SIN_CAMBIOS', () => {
    const vinculado = local({ origenGlpi: 'Computer #12' });
    expect(planificar(glpi, contexto({ vinculado }))).toMatchObject({
      accion: 'SIN_CAMBIOS',
      codigo: 'COD-LOCAL',
      local: vinculado,
    });
  });

  it('ya vinculado y GLPI trae cambios → ACTUALIZAR solo lo que cambió', () => {
    const vinculado = local({ origenGlpi: 'Computer #12', ubicacion: 'Bodega' });
    const plan = planificar(glpi, contexto({ vinculado }));
    expect(plan.accion).toBe('ACTUALIZAR');
    expect(plan.diferencias).toEqual({
      ubicacion: { antes: 'Bodega', despues: 'TICs' },
    });
  });

  it('cambio del n.º de inventario en GLPI → se ACTUALIZA el mismo activo; su código no cambia', () => {
    const vinculado = local({ origenGlpi: 'Computer #12', numeroInventario: 'ANTIGUO' });
    const plan = planificar(glpi, contexto({ vinculado }));
    expect(plan).toMatchObject({ accion: 'ACTUALIZAR', codigo: 'COD-LOCAL' });
    expect(plan.diferencias).toEqual({
      numeroInventario: { antes: 'ANTIGUO', despues: 'INV-12' },
    });
  });

  it('el vínculo manda aunque otro activo tenga su n.º de inventario como código', () => {
    const vinculado = local({ origenGlpi: 'Computer #12' });
    const otro = local({ id: 7, codigo: 'INV-12' });
    const plan = planificar(
      glpi,
      contexto({
        vinculado,
        candidatos: [candidato('inventario', { conEseCodigo: otro, manuales: [otro] })],
      }),
    );
    expect(plan).toMatchObject({ accion: 'SIN_CAMBIOS', local: vinculado });
  });

  it('GLPI nunca borra un dato local con un campo vacío', () => {
    const sinModelo = mapearActivo(
      'Computer',
      { ...ordenador(12, 'INV-12', '7-1-22-999'), model: null, status: null },
      'America/Guayaquil',
      REGLA,
    );
    const vinculado = local({ origenGlpi: 'Computer #12', modelo: 'Modelo anotado a mano', estado: 'Bueno' });
    expect(planificar(sinModelo, contexto({ vinculado })).accion).toBe('SIN_CAMBIOS');
  });

  it('vinculado pero dado de baja en local → OMITIR (no se reactiva)', () => {
    const vinculado = local({ origenGlpi: 'Computer #12', deletedAt: new Date() });
    expect(planificar(glpi, contexto({ vinculado })).accion).toBe('OMITIR');
  });
});

describe('planificar · código operativo de un alta', () => {
  it('prioridad 1: código institucional válido y único', () => {
    expect(planificar(glpi, contexto())).toMatchObject({
      accion: 'CREAR',
      codigo: '7-1-22-999',
      revision: [],
    });
  });

  it('código institucional repetido en GLPI → se detecta y se pasa al n.º de inventario', () => {
    const plan = planificar(
      glpi,
      contexto({
        candidatos: [
          candidato('institucional', { repetidoEn: ['Computer #3'] }),
          candidato('inventario'),
        ],
      }),
    );
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'INV-12' });
    expect(plan.revision[0]).toContain('código institucional "7-1-22-999" está repetido en GLPI (Computer #3)');

    const muchos = planificar(
      glpi,
      contexto({
        candidatos: [
          candidato('inventario', {
            repetidoEn: ['Computer #1', 'Computer #2', 'Computer #3', 'Computer #4', 'Computer #5'],
          }),
        ],
      }),
    );
    expect(muchos.revision[0]).toContain('(Computer #1, Computer #2, Computer #3 y 2 más)');
  });

  it('institucional y n.º de inventario repetidos → código de respaldo, determinista', () => {
    const repetidos = contexto({
      candidatos: [
        candidato('institucional', { repetidoEn: ['Computer #3'] }),
        candidato('inventario', { repetidoEn: ['Computer #1', 'Computer #2'] }),
      ],
    });
    const plan = planificar(glpi, repetidos);
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'GLPI-PC-12' });
    expect(plan.revision).toHaveLength(2);
    // La misma entrada da siempre el mismo código.
    expect(planificar(glpi, repetidos).codigo).toBe('GLPI-PC-12');
  });

  it('sin ningún candidato (comentario "S/N" y sin n.º de inventario) → código de respaldo', () => {
    expect(planificar(glpi, contexto({ candidatos: [] }))).toMatchObject({
      accion: 'CREAR',
      codigo: 'GLPI-PC-12',
    });
  });

  it('el código ya es de otro activo VINCULADO → no se reutiliza', () => {
    const otro = local({ id: 3, codigo: '7-1-22-999', origenGlpi: 'Computer #3' });
    const plan = planificar(
      glpi,
      contexto({ candidatos: [candidato('institucional', { conEseCodigo: otro })] }),
    );
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'GLPI-PC-12' });
    expect(plan.revision[0]).toContain('ya es el código del activo local id 3 (Computer #3)');
  });

  it('el código ya se asignó a otro elemento en esta ejecución → no se repite', () => {
    const plan = planificar(
      glpi,
      contexto({
        reservados: {
          codigos: new Map([['7-1-22-999', 'Computer #3']]),
          manuales: new Map(),
        },
      }),
    );
    expect(plan.codigo).toBe('INV-12');
  });

  it('si hasta el código de respaldo está ocupado → OMITIR, nunca un duplicado', () => {
    const plan = planificar(
      glpi,
      contexto({ candidatos: [], conCodigoRespaldo: local({ id: 9, codigo: 'GLPI-PC-12' }) }),
    );
    expect(plan.accion).toBe('OMITIR');
    expect(plan.motivo).toContain('Revísalo a mano');
  });
});

describe('planificar · vinculación de activos registrados a mano', () => {
  it('coincidencia inequívoca (valor único en GLPI, un solo activo manual) → ENLAZAR', () => {
    const manual = local({ codigo: 'INV-12', custodio: 'Juan Pérez' });
    const plan = planificar(
      glpi,
      contexto({
        candidatos: [
          candidato('institucional'),
          candidato('inventario', { conEseCodigo: manual, manuales: [manual] }),
        ],
      }),
    );
    expect(plan).toMatchObject({ accion: 'ENLAZAR', codigo: 'INV-12', local: manual });
    // Las diferencias quedan a la vista: nada se sobrescribe en silencio.
    expect(plan.diferencias.custodio).toEqual({ antes: 'Juan Pérez', despues: 'usuario12' });
  });

  it('también vincula por el campo n.º de inventario del activo manual, conservando su código', () => {
    const manual = local({ codigo: 'MI-CODIGO', numeroInventario: 'INV-12' });
    const plan = planificar(
      glpi,
      contexto({ candidatos: [candidato('inventario', { manuales: [manual] })] }),
    );
    expect(plan).toMatchObject({ accion: 'ENLAZAR', codigo: 'MI-CODIGO' });
  });

  it('n.º de inventario REPETIDO en GLPI → no se vincula; se crea aparte y se avisa', () => {
    const manual = local({ codigo: 'INV-12' });
    const plan = planificar(
      glpi,
      contexto({
        candidatos: [
          candidato('inventario', {
            repetidoEn: ['Computer #1'],
            conEseCodigo: manual,
            manuales: [manual],
          }),
        ],
      }),
    );
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'GLPI-PC-12', local: null });
    expect(plan.revision[0]).toContain('No se vincula con INV-12 (id 50)');
  });

  it('dos activos manuales candidatos → no se vincula con ninguno', () => {
    const a = local({ id: 1, codigo: 'A', numeroInventario: 'INV-12' });
    const b = local({ id: 2, codigo: 'B', numeroInventario: 'INV-12' });
    const plan = planificar(
      glpi,
      contexto({ candidatos: [candidato('inventario', { manuales: [a, b] })] }),
    );
    expect(plan.accion).toBe('CREAR');
    expect(plan.revision[0]).toContain('hay 2 activos manuales');
  });

  it('un activo manual ya vinculado en esta ejecución no se vincula dos veces', () => {
    const manual = local({ codigo: 'INV-12' });
    const plan = planificar(
      glpi,
      contexto({
        candidatos: [candidato('inventario', { conEseCodigo: manual, manuales: [manual] })],
        reservados: { codigos: new Map(), manuales: new Map([[50, 'Computer #1']]) },
      }),
    );
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'GLPI-PC-12' });
  });

  it('activo manual dado de baja con ese código → no se vincula ni se reutiliza el código', () => {
    const deBaja = local({ codigo: 'INV-12', deletedAt: new Date() });
    const plan = planificar(
      glpi,
      contexto({ candidatos: [candidato('inventario', { conEseCodigo: deBaja })] }),
    );
    expect(plan).toMatchObject({ accion: 'CREAR', codigo: 'GLPI-PC-12' });
    expect(plan.revision[0]).toContain('dado de baja');
  });
});
