import type { GlpiSyncConfig } from './config.js';
import { GlpiClient, type GlpiItem } from './glpi-client.js';
import { formatearInforme } from './informe.js';
import { claveCodigo } from './inventario-local.js';
import { RESPONSABLE_GLPI } from './plan.js';
import { Sincronizador } from './sincronizador.js';
import {
  CREDENCIALES_PRUEBA,
  glpiFalso,
  type DatosGlpiFalso,
} from './testing/glpi-falso.js';
import {
  CODIGOS_ESPERADOS,
  equipoDeRed,
  ordenador,
  ordenadores,
  REGLA,
} from './testing/inventario-ejemplo.js';
import {
  CONFIG_PRUEBA,
  InventarioEnMemoria,
} from './testing/inventario-en-memoria.js';

// Estas pruebas tratan la lectura COMPLETA; la incremental tiene su propio archivo.
const CONFIG: GlpiSyncConfig = { ...CONFIG_PRUEBA, modo: 'completa' };

const INVENTARIO = (): DatosGlpiFalso => ({
  elementos: { Computer: ordenadores(), NetworkEquipment: [equipoDeRed()] },
});

function montar(
  datos: DatosGlpiFalso,
  config: Partial<GlpiSyncConfig> = {},
  inventario = new InventarioEnMemoria(),
) {
  const falso = glpiFalso(datos);
  const completa = { ...CONFIG, ...config };
  const cliente = new GlpiClient({ ...completa, fetch: falso.fetch });
  const sincronizador = new Sincronizador(completa, cliente, inventario, () => {});
  return { falso, datos, inv: inventario, sincronizador };
}

const foto = (inv: InventarioEnMemoria) => JSON.stringify(inv.activos);

describe('importación inicial del inventario real (25 ordenadores + 1 equipo de red)', () => {
  it('crea 26 activos distintos: ninguno se omite por compartir n.º de inventario', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    const informe = await sincronizador.ejecutar();

    expect(informe.errores).toEqual([]);
    expect(informe.totales.Computer).toMatchObject({ leidos: 25, CREAR: 25, OMITIR: 0, ERROR: 0 });
    expect(informe.totales.NetworkEquipment).toMatchObject({ leidos: 1, CREAR: 1, OMITIR: 0, ERROR: 0 });
    expect(inv.activos).toHaveLength(26);
    expect(new Set(inv.activos.map((a) => a.origenGlpi)).size).toBe(26);
    expect(new Set(inv.activos.map((a) => claveCodigo(a.codigo))).size).toBe(26);
  });

  it('los 22 equipos con inventario "001" y los 2 con "002" se conservan todos, con su n.º original', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    const ordenadoresLocales = inv.activos.filter((a) => a.origenGlpi!.startsWith('Computer'));
    expect(ordenadoresLocales.filter((a) => a.numeroInventario === '001')).toHaveLength(22);
    expect(ordenadoresLocales.filter((a) => a.numeroInventario === '002')).toHaveLength(2);
    // El n.º de inventario repetido nunca se usa como código operativo.
    expect(inv.activos.some((a) => a.codigo === '001' || a.codigo === '002')).toBe(false);
  });

  it('el equipo de red #1 no se confunde con el ordenador #1 (mismo id, mismo inventario)', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    const pc = inv.activos.find((a) => a.origenGlpi === 'Computer #1')!;
    const red = inv.activos.find((a) => a.origenGlpi === 'NetworkEquipment #1')!;
    expect(pc.id).not.toBe(red.id);
    expect(pc.nombre).toBe('Laptop 1');
    expect(red).toMatchObject({ nombre: 'Central Telefónica', codigo: '7-1-14-6' });
  });

  it('códigos operativos: institucional si es válido y único; si no, el de respaldo', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    const codigos = Object.fromEntries(
      inv.activos
        .filter((a) => a.origenGlpi!.startsWith('Computer'))
        .map((a) => [Number(a.origenGlpi!.split('#')[1]), a.codigo]),
    );
    expect(codigos).toEqual(CODIGOS_ESPERADOS);
    // 11 con código institucional y 14 con código de respaldo.
    expect(Object.values(codigos).filter((c) => c.startsWith('GLPI-PC-'))).toHaveLength(14);
  });

  it('código institucional repetido: se conservan los DOS activos, con el original guardado y aviso', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    const informe = await sincronizador.ejecutar();
    const repetidos = inv.activos.filter((a) => a.codigoInstitucional === '7-1-22-177');
    expect(repetidos.map((a) => [a.origenGlpi, a.codigo])).toEqual([
      ['Computer #1', 'GLPI-PC-1'],
      ['Computer #10', 'GLPI-PC-10'],
    ]);
    const elemento = informe.elementos.find((e) => e.glpiId === 10 && e.itemtype === 'Computer')!;
    expect(elemento.revision.join('\n')).toContain('"7-1-22-177" está repetido en GLPI (Computer #1)');
  });

  it('"S/N: …" y formato irregular: código de respaldo, original conservado e informe para revisión', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    const informe = await sincronizador.ejecutar();
    const conPrefijo = inv.activos.find((a) => a.origenGlpi === 'Computer #6')!;
    expect(conPrefijo).toMatchObject({ codigo: 'GLPI-PC-6', codigoInstitucional: 'S/N: 7-1-22-183' });
    const sinMencion = inv.activos.find((a) => a.origenGlpi === 'Computer #4')!;
    expect(sinMencion).toMatchObject({ codigo: 'GLPI-PC-4', codigoInstitucional: null });
    const irregular = inv.activos.find((a) => a.origenGlpi === 'Computer #26')!;
    expect(irregular).toMatchObject({ codigo: 'GLPI-PC-26', codigoInstitucional: '7-1-7-22--76' });

    const texto = formatearInforme(informe);
    expect(texto).toContain('REQUIEREN REVISIÓN MANUAL');
    expect(texto).toContain('"S/N: 7-1-22-183" con formato irregular');
    expect(texto).toContain('Sin código institucional');
    // El n.º de inventario "001" lo comparten 23 elementos: se resume, no se listan todos.
    expect(texto).toMatch(/"001" está repetido en GLPI \([^)]* y \d+ más\)/);
    expect(texto).toContain('"7-1-7-22--76" con formato irregular');
  });

  it('toda alta queda en el historial firmada por GLPI', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    expect(inv.historial).toHaveLength(26);
    expect(inv.historial.every((h) => h.responsable === 'GLPI' && h.accion === 'CREAR')).toBe(true);
  });
});

describe('idempotencia', () => {
  it('segunda sincronización idéntica: ningún activo nuevo, ningún cambio, ningún registro de historial', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    const antes = foto(inv);
    const segunda = await sincronizador.ejecutar();

    expect(segunda.totales.Computer).toMatchObject({ leidos: 25, CREAR: 0, SIN_CAMBIOS: 25 });
    expect(segunda.totales.NetworkEquipment).toMatchObject({ CREAR: 0, SIN_CAMBIOS: 1 });
    expect(foto(inv)).toBe(antes);
    expect(inv.historial).toHaveLength(26);
  });

  it('la simulación no escribe nada, ni la primera vez ni repetida', async () => {
    const { inv, sincronizador } = montar(INVENTARIO(), { dryRun: true });
    const primera = await sincronizador.ejecutar();
    const segunda = await sincronizador.ejecutar();
    expect(primera.dryRun).toBe(true);
    expect(primera.totales.Computer).toMatchObject({ CREAR: 25 });
    expect(segunda.totales).toEqual(primera.totales);
    expect(segunda.elementos.map((e) => e.codigo)).toEqual(primera.elementos.map((e) => e.codigo));
    expect(inv.activos).toEqual([]);
    expect(inv.historial).toEqual([]);
  });

  it('cambio del n.º de inventario en GLPI: se actualiza el activo existente, sin crear otro ni cambiar su código', async () => {
    const montaje = montar(INVENTARIO());
    await montaje.sincronizador.ejecutar();
    const antes = montaje.inv.activos.find((a) => a.origenGlpi === 'Computer #2')!;
    const [idAntes, codigoAntes] = [antes.id, antes.codigo];

    // En GLPI corrigen el inventario del equipo #2.
    const datos = INVENTARIO();
    datos.elementos.Computer[1] = ordenador(2, 'INV-NUEVO-2', '7-1-22-69');
    const { sincronizador } = montar(datos, {}, montaje.inv);
    const informe = await sincronizador.ejecutar();

    expect(montaje.inv.activos).toHaveLength(26);
    const despues = montaje.inv.activos.find((a) => a.origenGlpi === 'Computer #2')!;
    expect(despues).toMatchObject({ id: idAntes, codigo: codigoAntes, numeroInventario: 'INV-NUEVO-2' });
    expect(informe.totales.Computer).toMatchObject({ CREAR: 0, ACTUALIZAR: 1, SIN_CAMBIOS: 24 });
  });

  it('un código operativo corregido a mano se respeta: la sincronización no lo renombra', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    await sincronizador.ejecutar();
    inv.activos.find((a) => a.origenGlpi === 'Computer #1')!.codigo = 'QT-7-1-22-177';
    const segunda = await sincronizador.ejecutar();
    expect(segunda.elementos[0]).toMatchObject({ resultado: 'SIN_CAMBIOS', codigo: 'QT-7-1-22-177' });
    expect(inv.activos).toHaveLength(26);
  });

  it('un elemento que desaparece de GLPI NO se borra ni se da de baja en local', async () => {
    const montaje = montar(INVENTARIO());
    await montaje.sincronizador.ejecutar();
    const datos = INVENTARIO();
    datos.elementos.Computer = datos.elementos.Computer.slice(0, 10);
    await montar(datos, {}, montaje.inv).sincronizador.ejecutar();
    expect(montaje.inv.activos).toHaveLength(26);
    expect(montaje.inv.activos.every((a) => a.deletedAt === null)).toBe(true);
  });
});

describe('concurrencia', () => {
  it('dos sincronizaciones simultáneas: una toma el bloqueo y la otra no llega a empezar', async () => {
    const inv = new InventarioEnMemoria();
    const a = montar(INVENTARIO(), {}, inv);
    const b = montar(INVENTARIO(), {}, inv);
    const informes = await Promise.all([a.sincronizador.ejecutar(), b.sincronizador.ejecutar()]);

    expect(inv.activos).toHaveLength(26);
    expect(new Set(inv.activos.map((x) => x.origenGlpi)).size).toBe(26);
    expect(new Set(inv.activos.map((x) => claveCodigo(x.codigo))).size).toBe(26);
    // Exactamente una se ejecutó; la otra se rechazó sin leer GLPI ni escribir.
    const [rechazada] = informes.filter((i) => i.enCurso);
    const [ejecutada] = informes.filter((i) => !i.enCurso);
    expect(rechazada.errores[0]).toContain('Ya hay una sincronización en curso');
    expect(rechazada.elementos).toEqual([]);
    expect(ejecutada.elementos.filter((e) => e.resultado === 'CREAR')).toHaveLength(26);
    expect(ejecutada.elementos.filter((e) => e.resultado === 'ERROR')).toEqual([]);
    expect(inv.ejecuciones).toHaveLength(1);
    expect(inv.ejecuciones[0]).toMatchObject({ enCurso: false, resultado: { estado: 'EXITOSA' } });

    // Y la siguiente ejecución lo encuentra todo en orden.
    const despues = await a.sincronizador.ejecutar();
    expect(despues.totales.Computer).toMatchObject({ CREAR: 0, SIN_CAMBIOS: 25, ERROR: 0 });
  });
});

describe('activos registrados a mano', () => {
  const unico = (): DatosGlpiFalso => ({
    elementos: { Computer: [ordenador(40, 'INV-40', '7-1-22-400')], NetworkEquipment: [] },
  });

  it('coincidencia inequívoca: se vincula sin duplicar y sin perder sus datos propios', async () => {
    const { inv, sincronizador } = montar(unico());
    const manual = inv.manual({ codigo: 'INV-40', cifrado: true, modelo: 'Anotado a mano' });
    const informe = await sincronizador.ejecutar();

    expect(informe.elementos[0]).toMatchObject({ resultado: 'ENLAZAR', activoId: manual.id });
    expect(inv.activos).toHaveLength(1);
    expect(inv.activos[0]).toMatchObject({
      id: manual.id,
      codigo: 'INV-40', // su código operativo no cambia
      origenGlpi: 'Computer #40',
      cifrado: true, // dato local: GLPI no lo conoce
      codigoInstitucional: '7-1-22-400',
    });
    // Queda a la vista qué valores sustituyó GLPI.
    expect(informe.elementos[0].diferencias.custodio).toEqual({ antes: 'Juan Pérez', despues: 'usuario40' });
    expect(inv.historial).toEqual([{ activoId: manual.id, accion: 'ACTUALIZAR', responsable: 'GLPI' }]);
  });

  it('en simulación la vinculación solo se informa: el activo manual queda intacto', async () => {
    const { inv, sincronizador } = montar(unico(), { dryRun: true });
    inv.manual({ codigo: 'INV-40' });
    const antes = foto(inv);
    const informe = await sincronizador.ejecutar();
    expect(informe.elementos[0].resultado).toBe('ENLAZAR');
    expect(foto(inv)).toBe(antes);
  });

  it('coincidencia AMBIGUA (n.º de inventario "001" repetido en GLPI): no se vincula ni se toca el activo manual', async () => {
    const { inv, sincronizador } = montar(INVENTARIO());
    const manual = inv.manual({ codigo: '001' });
    const antes = JSON.stringify(manual);
    const informe = await sincronizador.ejecutar();

    expect(inv.activos).toHaveLength(27); // el manual + los 26 de GLPI
    expect(JSON.stringify(inv.activos.find((a) => a.id === manual.id))).toBe(antes);
    expect(informe.elementos.filter((e) => e.resultado === 'ENLAZAR')).toEqual([]);
    expect(formatearInforme(informe)).toContain('No se vincula con 001');
  });

  it('dos activos manuales candidatos: no se vincula con ninguno', async () => {
    const { inv, sincronizador } = montar(unico());
    inv.manual({ codigo: 'A-1', numeroInventario: 'INV-40' });
    inv.manual({ codigo: 'A-2', numeroInventario: 'INV-40' });
    const informe = await sincronizador.ejecutar();
    expect(informe.elementos[0]).toMatchObject({ resultado: 'CREAR', codigo: '7-1-22-400' });
    expect(inv.activos).toHaveLength(3);
    expect(inv.activos.filter((a) => a.origenGlpi === null)).toHaveLength(2);
  });
});

describe('errores de GLPI y respuestas inesperadas', () => {
  const sembrado = async () => {
    const montaje = montar(INVENTARIO());
    await montaje.sincronizador.ejecutar();
    return montaje.inv;
  };

  it('error temporal de GLPI: no se borra ni se modifica ningún activo local', async () => {
    const inv = await sembrado();
    const antes = foto(inv);
    const { sincronizador } = montar(
      { ...INVENTARIO(), rutasRotas: ['/v2/Assets/Computer', '/v2/Assets/NetworkEquipment'] },
      {},
      inv,
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.errores).toHaveLength(2);
    expect(informe.errores[0]).toContain('NO se procesó ningún elemento');
    expect(foto(inv)).toBe(antes);
  });

  it('lectura completa con CERO elementos habiendo inventario: no se toca nada y se pide confirmación', async () => {
    const inv = await sembrado();
    const antes = foto(inv);
    const { sincronizador } = montar({ elementos: { Computer: [], NetworkEquipment: [] } }, {}, inv);
    const informe = await sincronizador.ejecutar();
    // GLPI respondió bien (no es un fallo de lectura), pero que desaparezca TODO
    // el inventario no se acepta sin confirmación: nadie pasa a Dado de baja.
    expect(informe.totales.Computer).toMatchObject({ leidos: 0, INACTIVAR: 0 });
    expect(informe.errores).toHaveLength(2);
    expect(informe.errores[0]).toContain('GLPI ya no devuelve 25 de los 25');
    expect(informe.errores[0]).toContain('NO se marcó ninguno');
    expect(foto(inv)).toBe(antes);
    expect(informe.puntoControl).toBeNull();
  });

  it('respuesta que no es una lista: es un ERROR, no "cero elementos"', async () => {
    const inv = await sembrado();
    const antes = foto(inv);
    const falso = glpiFalso(INVENTARIO());
    const fetchRaro = ((url: string, init?: RequestInit) =>
      String(url).includes('/Assets/')
        ? Promise.resolve(new Response(JSON.stringify({ mensaje: 'mantenimiento' }), { status: 200 }))
        : falso.fetch(url, init)) as typeof fetch;
    const sincronizador = new Sincronizador(
      CONFIG,
      new GlpiClient({ ...CONFIG, fetch: fetchRaro }),
      inv,
      () => {},
    );
    const informe = await sincronizador.ejecutar();
    expect(informe.errores[0]).toContain('respuesta inesperada');
    expect(foto(inv)).toBe(antes);
  });

  it('un elemento sin id válido no crea un registro incompleto: error y el resto continúa', async () => {
    const raros = [{ name: 'Sin id' } as unknown as GlpiItem, ordenador(41, 'INV-41', null)];
    const { inv, sincronizador } = montar({ elementos: { Computer: raros, NetworkEquipment: [] } });
    const informe = await sincronizador.ejecutar();
    expect(informe.totales.Computer).toMatchObject({ leidos: 2, CREAR: 1, ERROR: 1 });
    expect(inv.activos.map((a) => a.origenGlpi)).toEqual(['Computer #41']);
  });

  it('el fallo de un tipo no impide sincronizar los demás', async () => {
    const { inv, sincronizador } = montar({ ...INVENTARIO(), rutasRotas: ['/v2/Assets/Computer'] });
    const informe = await sincronizador.ejecutar();
    expect(informe.errores).toHaveLength(1);
    expect(informe.totales.NetworkEquipment).toMatchObject({ CREAR: 1 });
    expect(inv.activos).toHaveLength(1);
  });

  it('si falta la criticidad por defecto no escribe nada (ni contacta con GLPI)', async () => {
    const { falso, inv, sincronizador } = montar(INVENTARIO(), { criticidadPorDefecto: 'Inexistente' });
    const informe = await sincronizador.ejecutar();
    expect(informe.errores[0]).toContain('Inexistente');
    expect(inv.activos).toEqual([]);
    expect(falso.peticiones).toEqual([]);
  });
});

describe('paginación', () => {
  it('con bloques de 10 se procesan los 25 ordenadores: 3 peticiones y ninguno perdido', async () => {
    const { falso, inv, sincronizador } = montar(INVENTARIO(), { tamanoBloque: 10 });
    const informe = await sincronizador.ejecutar();
    const paginas = falso.peticiones
      .filter((p) => p.ruta.startsWith('/v2/Assets/Computer'))
      .map((p) => new URLSearchParams(p.ruta.split('?')[1]).get('start'));
    // Tres bloques del listado y una consulta expresa a la papelera (vacía).
    expect(paginas).toEqual(['0', '10', '20', '0']);
    expect(informe.totales.Computer).toMatchObject({ leidos: 25, CREAR: 25 });
    expect(inv.activos).toHaveLength(26);
  });

  it('el resultado no depende del tamaño de bloque (10, 50 o de uno en uno)', async () => {
    const codigos = async (tamanoBloque: number) => {
      const { inv, sincronizador } = montar(INVENTARIO(), { tamanoBloque });
      await sincronizador.ejecutar();
      return inv.activos.map((a) => `${a.origenGlpi}=${a.codigo}`).sort();
    };
    const de50 = await codigos(50);
    expect(await codigos(10)).toEqual(de50);
    expect(await codigos(1)).toEqual(de50);
  });

  it('con --max la lectura es parcial y el informe lo advierte', async () => {
    const { sincronizador } = montar(INVENTARIO(), { maxPorTipo: 10, dryRun: true });
    const informe = await sincronizador.ejecutar();
    expect(informe.lecturaParcial).toBe(true);
    expect(informe.totales.Computer).toMatchObject({ leidos: 10 });
    expect(formatearInforme(informe)).toContain('Lectura PARCIAL');
  });

  it('las plantillas se omiten; la papelera se registra como Dado de baja y no disputa códigos', async () => {
    const datos: DatosGlpiFalso = {
      elementos: {
        Computer: [
          ordenador(1, 'A-1', null),
          { ...ordenador(2, 'A-1', null), is_deleted: true },
          { ...ordenador(3, 'A-1', null), is_template: true },
        ],
        NetworkEquipment: [],
      },
    };
    const { inv, sincronizador } = montar(datos);
    const informe = await sincronizador.ejecutar();
    expect(informe.elementos.map((e) => e.resultado)).toEqual(['CREAR', 'CREAR', 'OMITIR']);
    // El vigente se queda con el n.º de inventario; el de la papelera, con el de respaldo.
    expect(inv.activos.map((a) => a.codigo)).toEqual(['A-1', 'GLPI-PC-2']);
    expect(inv.activos.map((a) => a.motivoInactivo)).toEqual([null, 'PAPELERA_GLPI']);
  });
});

describe('integridad: registros huérfanos', () => {
  it('con huérfanos NO se escribe nada ni se contacta con GLPI (un alta heredaría esos registros)', async () => {
    const { falso, inv, sincronizador } = montar(INVENTARIO());
    inv.registrosHuerfanos = [
      { tabla: 'respaldo', cantidad: 2 },
      { tabla: 'mantenimiento', cantidad: 2 },
    ];
    const informe = await sincronizador.ejecutar();
    expect(informe.errores[0]).toContain('2 en respaldo, 2 en mantenimiento');
    expect(informe.errores[0]).toContain('No se escribe nada');
    expect(inv.activos).toEqual([]);
    expect(falso.peticiones).toEqual([]);
  });

  it('en simulación se avisa del bloqueo, pero el informe se genera igual', async () => {
    const { inv, sincronizador } = montar(INVENTARIO(), { dryRun: true });
    inv.registrosHuerfanos = [{ tabla: 'respaldo', cantidad: 1 }];
    const informe = await sincronizador.ejecutar();
    expect(informe.errores[0]).toContain('se negaría a escribir');
    expect(informe.totales.Computer).toMatchObject({ leidos: 25, CREAR: 25 });
  });
});

describe('política explícita: mejorar códigos de respaldo', () => {
  const SIN_ETIQUETA = { codigoInstitucional: { ...REGLA, etiqueta: '' } };

  /** Reproduce lo ocurrido: primera importación sin la etiqueta configurada. */
  const importarSinEtiqueta = async () => {
    const montaje = montar(INVENTARIO(), SIN_ETIQUETA);
    await montaje.sincronizador.ejecutar();
    expect(montaje.inv.activos.every((a) => a.codigo.startsWith('GLPI-'))).toBe(true);
    expect(montaje.inv.activos.every((a) => a.codigoInstitucional === null)).toBe(true);
    return montaje.inv;
  };

  it('sin la opción: se rellena el código institucional original, pero NINGÚN código se renombra', async () => {
    const inv = await importarSinEtiqueta();
    const codigosAntes = inv.activos.map((a) => a.codigo);
    const informe = await montar(INVENTARIO(), {}, inv).sincronizador.ejecutar();

    expect(inv.activos.map((a) => a.codigo)).toEqual(codigosAntes);
    expect(inv.activos.find((a) => a.origenGlpi === 'Computer #2')!.codigoInstitucional).toBe('7-1-22-69');
    expect(informe.totales.Computer!.CREAR).toBe(0);
    expect(inv.activos).toHaveLength(26);
  });

  it('con la opción: los códigos de respaldo pasan al institucional válido y único; el resto no cambia', async () => {
    const inv = await importarSinEtiqueta();
    const { sincronizador } = montar(INVENTARIO(), { mejorarCodigos: true }, inv);
    const informe = await sincronizador.ejecutar();

    const codigos = Object.fromEntries(
      inv.activos
        .filter((a) => a.origenGlpi!.startsWith('Computer'))
        .map((a) => [Number(a.origenGlpi!.split('#')[1]), a.codigo]),
    );
    expect(codigos).toEqual(CODIGOS_ESPERADOS); // igual que una importación correcta desde cero
    expect(inv.activos.find((a) => a.origenGlpi === 'NetworkEquipment #1')!.codigo).toBe('7-1-14-6');
    expect(inv.activos).toHaveLength(26);
    expect(new Set(inv.activos.map((a) => claveCodigo(a.codigo))).size).toBe(26);

    const cambiado = informe.elementos.find((e) => e.glpiId === 2 && e.itemtype === 'Computer')!;
    expect(cambiado).toMatchObject({ resultado: 'ACTUALIZAR', codigo: '7-1-22-69' });
    expect(cambiado.diferencias.codigo).toEqual({ antes: 'GLPI-PC-2', despues: '7-1-22-69' });

    // Repetirla no cambia nada más.
    const otra = await sincronizador.ejecutar();
    expect(otra.totales.Computer).toMatchObject({ ACTUALIZAR: 0, SIN_CAMBIOS: 25 });
  });

  it('un código puesto a mano nunca se renombra, ni con la opción activada', async () => {
    const inv = await importarSinEtiqueta();
    inv.activos.find((a) => a.origenGlpi === 'Computer #2')!.codigo = 'MI-CODIGO-2';
    await montar(INVENTARIO(), { mejorarCodigos: true }, inv).sincronizador.ejecutar();
    expect(inv.activos.find((a) => a.origenGlpi === 'Computer #2')!.codigo).toBe('MI-CODIGO-2');
  });

  it('en simulación la mejora solo se informa', async () => {
    const inv = await importarSinEtiqueta();
    const antes = foto(inv);
    const informe = await montar(INVENTARIO(), { mejorarCodigos: true, dryRun: true }, inv).sincronizador.ejecutar();
    expect(informe.elementos.filter((e) => e.diferencias.codigo)).toHaveLength(12);
    expect(foto(inv)).toBe(antes);
  });
});

describe('servidores: categoría según el tipo de equipo de GLPI', () => {
  const servidores = (): DatosGlpiFalso => ({
    elementos: {
      Computer: [
        { ...ordenador(28, '028', null), name: 'HP-520', type: { id: 7, name: 'Servidor Físico' } },
        { ...ordenador(29, '029', null), name: 'VM-CONTABILIDAD', type: { id: 8, name: 'Servidor Virtual' } },
        ordenador(30, '030', null),
      ],
      NetworkEquipment: [],
    },
  });

  it('un Computer «Servidor Físico» o «Servidor Virtual» se crea en su categoría, sin duplicar y con su referencia', async () => {
    const inv = new InventarioEnMemoria();
    inv.categoriasExtra = new Map([['Servidores físicos', 103], ['Servidores virtuales', 104]]);
    const { sincronizador } = montar(servidores(), {}, inv);
    const informe = await sincronizador.ejecutar();
    expect(informe.errores).toEqual([]);
    const por = (ref: string) => inv.activos.find((a) => a.origenGlpi === ref)!;
    expect(inv.categoriaDe.get(por('Computer #28').id)).toBe(103);
    expect(inv.categoriaDe.get(por('Computer #29').id)).toBe(104);
    expect(inv.categoriaDe.get(por('Computer #30').id)).toBe(1); // un portátil sigue en la categoría de Computer
    expect(por('Computer #29')).toMatchObject({ nombre: 'VM-CONTABILIDAD', tipo: 'Servidor Virtual' });
    // Repetir no crea nada.
    const segunda = await sincronizador.ejecutar();
    expect(segunda.totales.Computer).toMatchObject({ CREAR: 0 });
    expect(inv.activos).toHaveLength(3);
  });

  it('si la categoría del servidor no existe, usa la del tipo y lo deja para revisión (no aborta)', async () => {
    const inv = new InventarioEnMemoria();
    const { sincronizador } = montar(servidores(), {}, inv);
    const informe = await sincronizador.ejecutar();
    expect(informe.errores).toEqual([]);
    const vm = inv.activos.find((a) => a.origenGlpi === 'Computer #29')!;
    expect(inv.categoriaDe.get(vm.id)).toBe(1);
    const elemento = informe.elementos.find((e) => e.itemtype === 'Computer' && e.glpiId === 29)!;
    expect(elemento.revision.join(' ')).toMatch(/«Servidores virtuales» no existe en el catálogo/);
  });
});
