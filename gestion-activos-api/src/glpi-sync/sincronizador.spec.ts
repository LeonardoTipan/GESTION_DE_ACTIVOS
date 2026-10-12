import type { GlpiSyncConfig } from './config.js';
import { GlpiClient, type GlpiItem } from './glpi-client.js';
import { formatearInforme } from './informe.js';
import {
  claveCodigo,
  type Catalogos,
  type InventarioLocal,
} from './inventario-local.js';
import type { ActivoGlpi } from './mapeo.js';
import { RESPONSABLE_GLPI, type ActivoLocal, type Plan } from './plan.js';
import { Sincronizador } from './sincronizador.js';
import {
  CREDENCIALES_PRUEBA,
  glpiFalso,
  type DatosGlpiFalso,
} from './testing/glpi-falso.js';

/** Inventario en memoria que apunta cada escritura y quién firma el historial. */
class InventarioEnMemoria implements InventarioLocal {
  activos: ActivoLocal[] = [];
  historial: { activoId: number; accion: string; responsable: string; cambios: object }[] = [];
  categorias = ['Hardware', 'Red', 'Software'];
  criticidades = ['Baja', 'Media', 'Alta'];

  catalogos(): Promise<Catalogos> {
    return Promise.resolve({
      categorias: new Map(this.categorias.map((c, i) => [c, i + 1])),
      criticidades: new Map(this.criticidades.map((c, i) => [c, i + 1])),
    });
  }

  buscarPorCodigos(codigos: string[]): Promise<Map<string, ActivoLocal>> {
    const claves = new Set(codigos.map(claveCodigo));
    return Promise.resolve(
      new Map(
        this.activos
          .filter((a) => claves.has(claveCodigo(a.codigo)))
          .map((a) => [claveCodigo(a.codigo), { ...a }]),
      ),
    );
  }

  crear(glpi: ActivoGlpi): Promise<number> {
    const id = this.activos.length + 100;
    const { ultimaRevision: _, ...campos } = glpi.alCrear;
    this.activos.push({
      id,
      codigo: glpi.codigo,
      numeroSerie: null,
      estado: null,
      fabricante: null,
      comentario: null,
      ...campos,
      deletedAt: null,
      enlazadoConGlpi: true,
    });
    this.historial.push({ activoId: id, accion: 'CREAR', responsable: RESPONSABLE_GLPI, cambios: {} });
    return Promise.resolve(id);
  }

  aplicar(local: ActivoLocal, glpi: ActivoGlpi, plan: Plan): Promise<void> {
    const activo = this.activos.find((a) => a.id === local.id)!;
    Object.assign(activo, glpi.datos, { enlazadoConGlpi: true });
    this.historial.push({
      activoId: local.id,
      accion: 'ACTUALIZAR',
      responsable: RESPONSABLE_GLPI,
      cambios: plan.diferencias,
    });
    return Promise.resolve();
  }
}

const CONFIG: GlpiSyncConfig = {
  apiUrl: 'https://glpi.test/api.php',
  apiVersion: 'v2',
  ignorarSsl: false,
  credenciales: CREDENCIALES_PRUEBA,
  zonaHoraria: 'America/Guayaquil',
  itemtypes: ['Computer', 'NetworkEquipment', 'Software'],
  tamanoBloque: 10,
  dryRun: true,
  cron: '0 2 * * *',
  criticidadPorDefecto: 'Media',
  categoriaPorTipo: { Computer: 'Hardware', NetworkEquipment: 'Red', Software: 'Software' },
  dirInformes: 'glpi-informes',
  timeoutMs: 1000,
  databaseUrl: 'mysql://no-se-usa',
};

const lista = (n: number, prefijo: string): GlpiItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${prefijo}-${i + 1}`,
    otherserial: `${prefijo}-INV-${i + 1}`,
    user: { id: 1, name: 'jperez' },
    location: { id: 1, name: 'Matriz' },
    date_mod: '2026-10-01 09:30:00',
  }));

function montar(datos: DatosGlpiFalso, config: Partial<GlpiSyncConfig> = {}) {
  const falso = glpiFalso(datos);
  const completa = { ...CONFIG, ...config };
  const local = new InventarioEnMemoria();
  const cliente = new GlpiClient({ ...completa, fetch: falso.fetch });
  const sincronizador = new Sincronizador(completa, cliente, local, () => {});
  return { falso, local, sincronizador };
}

const local = (extra: Partial<ActivoLocal>): ActivoLocal => ({
  id: 1,
  codigo: 'PC-INV-1',
  nombre: 'PC-1',
  sistemas: 'Windows 10',
  custodio: 'jperez',
  ubicacion: 'Matriz',
  cifrado: false,
  numeroSerie: null,
  estado: null,
  fabricante: null,
  comentario: null,
  deletedAt: null,
  enlazadoConGlpi: false,
  ...extra,
});

describe('Sincronizador · simulación (dry-run)', () => {
  it('prueba con 10 de cada tipo: lee 30 y no escribe nada', async () => {
    const { falso, local: inv, sincronizador } = montar(
      {
        elementos: {
          Computer: lista(25, 'PC'),
          NetworkEquipment: lista(12, 'SW'),
          Software: lista(40, 'APP'),
        },
      },
      { maxPorTipo: 10 },
    );
    const informe = await sincronizador.ejecutar();

    expect(informe.dryRun).toBe(true);
    expect(informe.errores).toEqual([]);
    for (const tipo of CONFIG.itemtypes) {
      expect(informe.totales[tipo]).toMatchObject({ leidos: 10, CREAR: 10 });
    }
    expect(inv.activos).toEqual([]);
    expect(inv.historial).toEqual([]);
    expect(falso.tokensEmitidos()).toBe(1);
    expect(formatearInforme(informe)).toContain('SIMULACIÓN');
  });

  it('activo registrado a mano con el mismo código: se informa ENLAZAR con sus diferencias, sin duplicar', async () => {
    const { local: inv, sincronizador } = montar({ elementos: { Computer: lista(1, 'PC') } }, {
      itemtypes: ['Computer'],
    });
    inv.activos.push(local({ custodio: 'Juan Pérez', codigo: 'pc-inv-1' }));
    const informe = await sincronizador.ejecutar();

    expect(informe.elementos[0]).toMatchObject({
      resultado: 'ENLAZAR',
      activoId: 1,
      diferencias: { custodio: { antes: 'Juan Pérez', despues: 'jperez' } },
    });
    expect(inv.activos).toHaveLength(1);
    expect(inv.activos[0].custodio).toBe('Juan Pérez'); // simulación: intacto
  });
});

describe('Sincronizador · aplicando cambios', () => {
  it('crea los nuevos y firma el historial como GLPI', async () => {
    const { local: inv, sincronizador } = montar(
      { elementos: { Computer: lista(3, 'PC') } },
      { dryRun: false, itemtypes: ['Computer'] },
    );
    const informe = await sincronizador.ejecutar();

    expect(informe.totales.Computer).toMatchObject({ leidos: 3, CREAR: 3, ERROR: 0 });
    expect(inv.activos.map((a) => a.codigo)).toEqual(['PC-INV-1', 'PC-INV-2', 'PC-INV-3']);
    expect(inv.historial).toHaveLength(3);
    expect(inv.historial.every((h) => h.responsable === 'GLPI')).toBe(true);
  });

  it('enlaza el registrado a mano (sin duplicar) y actualiza solo lo que GLPI informa', async () => {
    const { local: inv, sincronizador } = montar(
      { elementos: { Computer: lista(1, 'PC') } },
      { dryRun: false, itemtypes: ['Computer'] },
    );
    inv.activos.push(local({ custodio: 'Juan Pérez' }));
    await sincronizador.ejecutar();

    expect(inv.activos).toHaveLength(1);
    expect(inv.activos[0]).toMatchObject({
      custodio: 'jperez',
      sistemas: 'Windows 10', // GLPI no informó del modelo: el dato local se conserva
    });
    expect(inv.historial).toEqual([
      {
        activoId: 1,
        accion: 'ACTUALIZAR',
        responsable: 'GLPI',
        cambios: { custodio: { antes: 'Juan Pérez', despues: 'jperez' } },
      },
    ]);
  });

  it('es idempotente: una segunda ejecución no cambia ni registra nada', async () => {
    const { local: inv, sincronizador } = montar(
      { elementos: { Computer: lista(5, 'PC') } },
      { dryRun: false, itemtypes: ['Computer'] },
    );
    await sincronizador.ejecutar();
    const segunda = await sincronizador.ejecutar();

    expect(segunda.totales.Computer).toMatchObject({ CREAR: 0, SIN_CAMBIOS: 5 });
    expect(inv.activos).toHaveLength(5);
    expect(inv.historial).toHaveLength(5);
  });

  it('lo que está en la papelera de GLPI o es plantilla se omite, con su motivo', async () => {
    const [a, b, c] = lista(3, 'PC');
    const { local: inv, sincronizador } = montar(
      { elementos: { Computer: [a, { ...b, is_deleted: true }, { ...c, is_template: true }] } },
      { dryRun: false, itemtypes: ['Computer'] },
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.elementos.map((e) => e.resultado)).toEqual(['CREAR', 'OMITIR', 'OMITIR']);
    expect(informe.elementos[1].motivo).toContain('papelera');
    expect(inv.activos).toHaveLength(1);
  });

  it('código repetido dentro de GLPI: el segundo se omite', async () => {
    const repetidos = lista(2, 'PC').map((e) => ({ ...e, otherserial: 'MISMO' }));
    const { local: inv, sincronizador } = montar(
      { elementos: { Computer: repetidos } },
      { dryRun: false, itemtypes: ['Computer'] },
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.elementos.map((e) => e.resultado)).toEqual(['CREAR', 'OMITIR']);
    expect(informe.elementos[1].motivo).toContain('Computer #1');
    expect(inv.activos).toHaveLength(1);
  });

  it('el fallo de un tipo no impide sincronizar los demás', async () => {
    const { sincronizador } = montar(
      {
        elementos: { Computer: lista(2, 'PC'), Software: lista(2, 'APP') },
        rutasRotas: ['/v2/Assets/Computer'],
      },
      { dryRun: false, itemtypes: ['Computer', 'Software'] },
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.errores).toHaveLength(1);
    expect(informe.errores[0]).toContain('Computer');
    expect(informe.totales.Software).toMatchObject({ CREAR: 2 });
  });

  it('si falta la criticidad por defecto no escribe nada (ni contacta con GLPI)', async () => {
    const { falso, local: inv, sincronizador } = montar(
      { elementos: { Computer: lista(2, 'PC') } },
      { dryRun: false, criticidadPorDefecto: 'Inexistente' },
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.errores[0]).toContain('Inexistente');
    expect(inv.activos).toEqual([]);
    expect(falso.peticiones).toEqual([]);
  });
});
