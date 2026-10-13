/**
 * Sincronización incremental, punto de control, reconciliación de bajas,
 * bloqueo y avisos. GLPI y la base son simulados (misma lógica que los reales).
 */
import type { GlpiSyncConfig } from './config.js';
import { GlpiClient, type GlpiItem } from './glpi-client.js';
import { formatearInforme } from './informe.js';
import { Sincronizador } from './sincronizador.js';
import { glpiFalso, type DatosGlpiFalso } from './testing/glpi-falso.js';
import {
  equipoDeRed,
  ordenador,
  ordenadores,
} from './testing/inventario-ejemplo.js';
import {
  CONFIG_PRUEBA,
  InventarioEnMemoria,
} from './testing/inventario-en-memoria.js';

const MIN = 60_000;
const HORA = 60 * MIN;
/** 13 de octubre de 2026, 10:00 en Quito (UTC−5). */
const T0 = Date.parse('2026-10-13T15:00:00.000Z');

/** Entorno completo con reloj controlado: GLPI falso + inventario en memoria. */
function entorno(config: Partial<GlpiSyncConfig> = {}) {
  const datos: DatosGlpiFalso = {
    elementos: { Computer: ordenadores(), NetworkEquipment: [equipoDeRed()] },
  };
  const falso = glpiFalso(datos);
  const inv = new InventarioEnMemoria();
  let reloj = T0;
  const sincronizar = (extra: Partial<GlpiSyncConfig> = {}) => {
    const completa = { ...CONFIG_PRUEBA, ...config, ...extra };
    return new Sincronizador(
      completa,
      new GlpiClient({ ...completa, fetch: falso.fetch }),
      inv,
      () => {},
      () => new Date(reloj),
    ).ejecutar();
  };
  const pc = (id: number): GlpiItem =>
    datos.elementos.Computer.find((x) => x.id === id)!;
  return {
    datos,
    falso,
    inv,
    sincronizar,
    pc,
    /** Avanza el reloj. */
    pasan: (ms: number) => {
      reloj += ms;
    },
    /** Hora local de Quito del reloj, con su desfase: como la escribe GLPI. */
    ahoraGlpi: () =>
      `${new Date(reloj - 5 * HORA).toISOString().slice(0, 19)}-05:00`,
    /** Filtros enviados a GLPI desde la última vez que se preguntó. */
    filtros: (() => {
      let vistas = 0;
      return () => {
        const nuevas = falso.peticiones.slice(vistas);
        vistas = falso.peticiones.length;
        return nuevas
          .filter((p) => p.ruta.startsWith('/v2/Assets/Computer'))
          .map((p) => new URLSearchParams(p.ruta.split('?')[1]).get('filter'));
      };
    })(),
    local: (id: number) => inv.activos.find((a) => a.origenGlpi === `Computer #${id}`)!,
  };
}

describe('1 · importación inicial', () => {
  it('sin punto de control hace una lectura COMPLETA, lo registra y fija el punto de control', async () => {
    const e = entorno();
    const informe = await e.sincronizar();

    expect(informe.modo).toBe('COMPLETA');
    expect(informe.errores).toEqual([]);
    expect(e.inv.activos).toHaveLength(26);
    expect(informe.cambios).toEqual({ detectados: 26, aplicados: 26 });
    expect(informe.puntoControl).toBe(new Date(T0).toISOString());
    expect(e.inv.ejecuciones).toHaveLength(1);
    expect(e.inv.ejecuciones[0]).toMatchObject({
      modo: 'COMPLETA',
      origen: 'CONSOLA',
      enCurso: false,
      resultado: {
        estado: 'EXITOSA',
        contadores: { leidos: 26, creados: 26, actualizados: 0, errores: 0, detectados: 26, aplicados: 26 },
      },
    });
    // Un aviso de alta por activo.
    expect(e.inv.notificaciones.filter((n) => n.tipo === 'ALTA')).toHaveLength(26);
  });

  it('una simulación no registra nada: ni ejecución, ni bloqueo, ni avisos, ni punto de control', async () => {
    const e = entorno({ dryRun: true });
    const informe = await e.sincronizar();
    expect(informe.totales.Computer).toMatchObject({ leidos: 25, CREAR: 25 });
    expect(informe.cambios).toEqual({ detectados: 26, aplicados: 0 });
    expect(informe.puntoControl).toBeNull();
    expect(e.inv.activos).toEqual([]);
    expect(e.inv.ejecuciones).toEqual([]);
    expect(e.inv.notificaciones).toEqual([]);
  });
});

describe('2 · segunda sincronización', () => {
  it('es INCREMENTAL, pide solo lo modificado (hora de Quito, con ventana de seguridad) y no duplica nada', async () => {
    const e = entorno();
    await e.sincronizar();
    e.filtros();
    const avisos = e.inv.notificaciones.length;
    const historial = e.inv.historial.length;

    e.pasan(40 * MIN);
    const informe = await e.sincronizar();

    expect(informe.modo).toBe('INCREMENTAL');
    // Punto de control 15:00 UTC − 15 min de ventana = 14:45 UTC = 09:45 en Quito.
    expect(informe.desde).toBe('2026-10-13T14:45:00.000Z');
    expect(e.filtros()).toEqual([
      'date_mod=ge=2026-10-13T09:45:00',
      'is_deleted==1;date_mod=ge=2026-10-13T09:45:00',
    ]);
    expect(informe.errores).toEqual([]);
    expect(informe.totales.Computer).toMatchObject({ leidos: 0, CREAR: 0 });
    expect(e.inv.activos).toHaveLength(26);
    expect(e.inv.notificaciones).toHaveLength(avisos);
    expect(e.inv.historial).toHaveLength(historial);
    // El punto de control avanza aunque no hubiera nada que hacer.
    expect(informe.puntoControl).toBe(new Date(T0 + 40 * MIN).toISOString());
  });
});

describe('3 · equipo nuevo', () => {
  it('la incremental lo incorpora sin releer el resto', async () => {
    const e = entorno();
    await e.sincronizar();
    e.pasan(30 * MIN);
    e.datos.elementos.Computer.push({
      ...ordenador(40, '', '7-1-22-400'),
      date_creation: e.ahoraGlpi(),
      date_mod: e.ahoraGlpi(),
    });
    e.pasan(10 * MIN);
    const informe = await e.sincronizar();

    expect(informe.modo).toBe('INCREMENTAL');
    expect(informe.totales.Computer).toMatchObject({ leidos: 1, CREAR: 1 });
    expect(e.inv.activos).toHaveLength(27);
    expect(e.local(40)).toMatchObject({ codigo: '7-1-22-400', inactivoDesde: null });
    expect(e.inv.notificaciones.at(-1)).toMatchObject({ tipo: 'ALTA' });
  });

  it('en una incremental, un código que ya usa otro equipo sincronizado no se asigna dos veces', async () => {
    const e = entorno();
    await e.sincronizar();
    e.pasan(30 * MIN);
    // Mismo código institucional que el ordenador #2, que no se relee en esta ejecución.
    e.datos.elementos.Computer.push({ ...ordenador(41, '', '7-1-22-69'), date_mod: e.ahoraGlpi() });
    e.pasan(MIN);
    const informe = await e.sincronizar();
    expect(e.local(41).codigo).toBe('GLPI-PC-41');
    expect(e.local(2).codigo).toBe('7-1-22-69');
    expect(informe.elementos[0].revision.join(' ')).toContain('repetido en GLPI (Computer #2)');
  });
});

describe('4, 5 y 6 · modificación de un equipo existente', () => {
  it('compara, actualiza solo lo cambiado, conserva los datos locales y avisa UNA vez', async () => {
    const e = entorno();
    await e.sincronizar();
    // Datos que solo existen en la aplicación.
    Object.assign(e.local(5), { cifrado: true, codigo: 'PORTATIL-GERENCIA' });
    const avisos = e.inv.notificaciones.length;

    e.pasan(30 * MIN);
    Object.assign(e.pc(5), {
      status: { id: 1, name: 'Malo' },
      location: { id: 12, name: 'Bodega' },
      date_mod: e.ahoraGlpi(),
    });
    e.pasan(10 * MIN);
    const informe = await e.sincronizar();

    expect(informe.totales.Computer).toMatchObject({ leidos: 1, ACTUALIZAR: 1 });
    const [elemento] = informe.elementos;
    expect(elemento.diferencias).toEqual({
      estado: { antes: 'Bueno', despues: 'Malo' },
      ubicacion: { antes: 'TICs', despues: 'Bodega' },
    });
    expect(informe.cambios).toEqual({ detectados: 1, aplicados: 1 });
    expect(e.local(5)).toMatchObject({
      estado: 'Malo',
      ubicacion: 'Bodega',
      cifrado: true, // local: GLPI no lo informa
      codigo: 'PORTATIL-GERENCIA', // corregido a mano: se respeta
    });
    expect(e.inv.historial.at(-1)).toMatchObject({ accion: 'ACTUALIZAR', responsable: 'GLPI' });
    expect(e.inv.notificaciones.slice(avisos)).toMatchObject([
      { tipo: 'CAMBIO_ESTADO', activoId: e.local(5).id, titulo: expect.stringContaining('Bueno → Malo') },
    ]);

    // Otra ejecución que vuelve a leer el mismo elemento (cae en la ventana): no repite nada.
    e.pasan(5 * MIN);
    const otra = await e.sincronizar();
    expect(otra.totales.Computer).toMatchObject({ leidos: 1, SIN_CAMBIOS: 1, ACTUALIZAR: 0 });
    expect(otra.cambios).toEqual({ detectados: 0, aplicados: 0 });
    expect(e.inv.notificaciones).toHaveLength(avisos + 1);
  });

  it('la ventana de seguridad recoge un cambio hecho justo antes del punto de control', async () => {
    const e = entorno();
    await e.sincronizar(); // punto de control: 10:00 de Quito
    // GLPI lo fechó a las 09:50 (reloj atrasado, o se guardó durante la ejecución anterior).
    Object.assign(e.pc(9), { contact: 'nueva.persona', date_mod: '2026-10-13T09:50:00-05:00' });
    e.pasan(20 * MIN);
    const informe = await e.sincronizar();
    expect(informe.totales.Computer).toMatchObject({ leidos: 1, ACTUALIZAR: 1 });
    expect(e.local(9).contacto).toBe('nueva.persona');
  });

  it('en simulación el cambio se DETECTA pero no se aplica ni mueve el punto de control', async () => {
    const e = entorno();
    await e.sincronizar();
    e.pasan(30 * MIN);
    Object.assign(e.pc(5), { status: { id: 1, name: 'Malo' }, date_mod: e.ahoraGlpi() });
    e.pasan(MIN);
    const informe = await e.sincronizar({ dryRun: true });
    expect(informe.cambios).toEqual({ detectados: 1, aplicados: 0 });
    expect(informe.puntoControl).toBeNull();
    expect(e.local(5).estado).toBe('Bueno');
    expect(e.inv.ejecuciones).toHaveLength(1);
    expect(formatearInforme(informe)).toContain('Cambios detectados: 1 · aplicados: 0');
  });
});

describe('7 · de activo a No activo (papelera de GLPI)', () => {
  it.each([false, true])(
    'un equipo enviado a la papelera pasa a No activo y vuelve si se restaura (papelera oculta en el listado: %s)',
    async (papeleraOculta) => {
      const e = entorno();
      e.datos.papeleraOculta = papeleraOculta;
      await e.sincronizar();
      const historial = e.inv.historial.filter((h) => h.activoId === e.local(7).id).length;

      e.pasan(30 * MIN);
      Object.assign(e.pc(7), { is_deleted: true, date_mod: e.ahoraGlpi() });
      e.pasan(MIN);
      const baja = await e.sincronizar();

      expect(baja.modo).toBe('INCREMENTAL');
      expect(baja.totales.Computer).toMatchObject({ leidos: 1, INACTIVAR: 1 });
      expect(e.local(7)).toMatchObject({ motivoInactivo: 'PAPELERA_GLPI', deletedAt: null });
      expect(e.local(7).inactivoDesde).toBeInstanceOf(Date);
      // Se conserva el activo y su historial, con una entrada más.
      expect(e.inv.activos).toHaveLength(26);
      expect(e.inv.historial.filter((h) => h.activoId === e.local(7).id)).toHaveLength(historial + 1);
      expect(e.inv.historial.at(-1)).toMatchObject({ accion: 'INACTIVAR' });
      expect(e.inv.notificaciones.at(-1)).toMatchObject({
        tipo: 'BAJA_DETECTADA',
        titulo: expect.stringContaining('papelera de GLPI'),
      });

      e.pasan(30 * MIN);
      Object.assign(e.pc(7), { is_deleted: false, date_mod: e.ahoraGlpi() });
      e.pasan(MIN);
      const vuelta = await e.sincronizar();
      expect(vuelta.totales.Computer).toMatchObject({ REACTIVAR: 1 });
      expect(e.local(7)).toMatchObject({ inactivoDesde: null, motivoInactivo: null });
      expect(e.inv.notificaciones.at(-1)).toMatchObject({ tipo: 'REACTIVACION' });
    },
  );

  it('los estados Malo, Regular y Bueno NO deciden si un equipo está activo', async () => {
    const e = entorno();
    e.pc(14).status = { id: 1, name: 'Malo' };
    e.pc(15).status = null;
    await e.sincronizar();
    expect(e.local(14)).toMatchObject({ estado: 'Malo', inactivoDesde: null });
    expect(e.local(15).inactivoDesde).toBeNull();
  });

  it('un activo dado de baja a mano en la aplicación no lo toca la sincronización', async () => {
    const e = entorno();
    await e.sincronizar();
    e.local(3).deletedAt = new Date();
    e.pasan(30 * MIN);
    Object.assign(e.pc(3), { name: 'Otro nombre', date_mod: e.ahoraGlpi() });
    e.pasan(MIN);
    const informe = await e.sincronizar();
    expect(informe.elementos[0]).toMatchObject({ resultado: 'OMITIR' });
    expect(e.local(3).nombre).toBe('Laptop 3');
  });
});

describe('10 · recuperación tras un fallo parcial', () => {
  it('si un elemento falla, el punto de control NO avanza y la siguiente ejecución lo recupera', async () => {
    const e = entorno();
    await e.sincronizar();
    const puntoInicial = (await e.inv.puntoDeControl())!.puntoControl;

    e.pasan(30 * MIN);
    Object.assign(e.pc(3), { contact: 'ana', date_mod: e.ahoraGlpi() });
    Object.assign(e.pc(4), { contact: 'luis', date_mod: e.ahoraGlpi() });
    e.inv.fallarEn.add('Computer #4');
    e.pasan(MIN);
    const fallida = await e.sincronizar();

    expect(fallida.totales.Computer).toMatchObject({ leidos: 2, ACTUALIZAR: 1, ERROR: 1 });
    expect(fallida.cambios).toEqual({ detectados: 2, aplicados: 1 });
    expect(fallida.puntoControl).toBeNull();
    expect((await e.inv.puntoDeControl())!.puntoControl).toEqual(puntoInicial);
    expect(e.inv.ejecuciones.at(-1)).toMatchObject({
      enCurso: false, // el bloqueo se libera aunque falle
      resultado: { estado: 'CON_ERRORES', puntoControl: null },
    });
    expect(e.local(3).contacto).toBe('ana'); // lo que sí se pudo, quedó aplicado
    expect(e.local(4).contacto).toBe('usuario4');
    const errores = () => e.inv.notificaciones.filter((n) => n.tipo === 'ERROR_SINCRONIZACION');
    expect(errores()).toHaveLength(1);

    // El mismo fallo otra vez: no se acumulan avisos idénticos.
    e.pasan(15 * MIN);
    await e.sincronizar();
    expect(errores()).toHaveLength(1);

    // Resuelto el problema, mucho después: se relee desde el punto de control ANTIGUO.
    e.inv.fallarEn.clear();
    e.pasan(3 * HORA);
    const reintento = await e.sincronizar();
    expect(reintento.desde).toBe(new Date(puntoInicial.getTime() - 15 * MIN).toISOString());
    expect(reintento.totales.Computer).toMatchObject({ leidos: 2, ACTUALIZAR: 1, SIN_CAMBIOS: 1, ERROR: 0 });
    expect(e.local(4).contacto).toBe('luis');
    expect(reintento.puntoControl).not.toBeNull();
    expect(e.inv.activos).toHaveLength(26); // sin duplicados tras los reintentos
  });
});

describe('11 · ejecuciones simultáneas', () => {
  it('mientras una escribe, otra (botón o automática) se rechaza sin tocar nada', async () => {
    const e = entorno();
    const [a, b] = await Promise.all([
      e.sincronizar({ origen: 'MANUAL', solicitadaPor: 'admin.test' }),
      e.sincronizar({ origen: 'AUTOMATICA' }),
    ]);
    const rechazadas = [a, b].filter((i) => i.enCurso);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].elementos).toEqual([]);
    expect(e.inv.activos).toHaveLength(26);
    expect(e.inv.ejecuciones).toHaveLength(1);
  });

  it('un bloqueo abandonado por un proceso caído caduca y no bloquea para siempre', async () => {
    const e = entorno();
    e.inv.ejecuciones.push({
      id: 1,
      origen: 'AUTOMATICA',
      modo: 'COMPLETA',
      tipos: ['Computer', 'NetworkEquipment'],
      inicio: new Date(Date.now() - 2 * HORA),
      caducaMin: 30,
      enCurso: true,
    });
    const informe = await e.sincronizar();
    expect(informe.enCurso).toBe(false);
    expect(e.inv.activos).toHaveLength(26);
  });
});

describe('12 · equipos eliminados definitivamente de GLPI', () => {
  const sinEl = (e: ReturnType<typeof entorno>, ...ids: number[]) => {
    e.datos.elementos.Computer = e.datos.elementos.Computer.filter((x) => !ids.includes(x.id));
  };

  it('una incremental NUNCA marca como No activo lo que no aparece', async () => {
    const e = entorno();
    await e.sincronizar();
    sinEl(e, 8);
    e.pasan(HORA);
    const informe = await e.sincronizar();
    expect(informe.modo).toBe('INCREMENTAL');
    expect(e.local(8).inactivoDesde).toBeNull();
  });

  it('la reconciliación completa periódica lo detecta y lo pasa a No activo, sin borrar nada', async () => {
    const e = entorno({ origen: 'AUTOMATICA' });
    await e.sincronizar();
    sinEl(e, 8);
    const historial = e.inv.historial.length;

    // A las 23 horas todavía no toca la completa…
    e.pasan(23 * HORA);
    expect((await e.sincronizar()).modo).toBe('INCREMENTAL');
    expect(e.local(8).inactivoDesde).toBeNull();

    // …a las 24, sí.
    e.pasan(HORA);
    const informe = await e.sincronizar();
    expect(informe.modo).toBe('COMPLETA');
    expect(informe.errores).toEqual([]);
    expect(informe.totales.Computer).toMatchObject({ leidos: 24, INACTIVAR: 1, SIN_CAMBIOS: 24 });
    expect(e.local(8)).toMatchObject({ motivoInactivo: 'AUSENTE_EN_GLPI', deletedAt: null });
    expect(e.inv.activos).toHaveLength(26);
    expect(e.inv.historial).toHaveLength(historial + 1);
    expect(e.inv.notificaciones.at(-1)).toMatchObject({
      tipo: 'BAJA_DETECTADA',
      titulo: expect.stringContaining('ya no existe en GLPI'),
    });

    // La siguiente completa no lo vuelve a marcar ni a avisar.
    const avisos = e.inv.notificaciones.length;
    const otra = await e.sincronizar({ modo: 'completa' });
    expect(otra.totales.Computer).toMatchObject({ INACTIVAR: 0 });
    expect(e.inv.notificaciones).toHaveLength(avisos);
  });

  it('el botón manual no dispara la reconciliación periódica: sigue siendo incremental', async () => {
    const e = entorno({ origen: 'MANUAL' });
    await e.sincronizar();
    e.pasan(72 * HORA);
    expect((await e.sincronizar()).modo).toBe('INCREMENTAL');
    // Salvo que se pida expresamente.
    expect((await e.sincronizar({ modo: 'completa' })).modo).toBe('COMPLETA');
  });

  it('si la lectura completa FALLA, nadie pasa a No activo', async () => {
    const e = entorno();
    await e.sincronizar();
    sinEl(e, 8);
    e.datos.rutasRotas = ['/v2/Assets/Computer'];
    const informe = await e.sincronizar({ modo: 'completa' });
    expect(informe.errores[0]).toContain('no se pudo leer de GLPI');
    expect(e.inv.activos.every((a) => a.inactivoDesde === null)).toBe(true);
    expect(informe.puntoControl).toBeNull();
  });

  it('una lectura parcial (--max) tampoco marca a nadie', async () => {
    const e = entorno();
    await e.sincronizar();
    const informe = await e.sincronizar({ maxPorTipo: 5 });
    expect(informe.lecturaParcial).toBe(true);
    expect(e.inv.activos.every((a) => a.inactivoDesde === null)).toBe(true);
    expect(informe.puntoControl).toBeNull();
  });

  it('si desaparece buena parte del inventario se pide confirmación antes de marcar', async () => {
    const e = entorno();
    await e.sincronizar();
    sinEl(e, ...e.datos.elementos.Computer.slice(0, 15).map((x) => x.id));

    const informe = await e.sincronizar({ modo: 'completa' });
    expect(informe.errores[0]).toContain('GLPI ya no devuelve 15 de los 25');
    expect(e.inv.activos.every((a) => a.inactivoDesde === null)).toBe(true);

    const confirmada = await e.sincronizar({ modo: 'completa', confirmarBajasMasivas: true });
    expect(confirmada.errores).toEqual([]);
    expect(confirmada.totales.Computer).toMatchObject({ INACTIVAR: 15 });
    expect(e.inv.activos).toHaveLength(26);
  });

  it('en simulación la reconciliación informa de la baja pero no la aplica', async () => {
    const e = entorno();
    await e.sincronizar();
    sinEl(e, 8);
    const informe = await e.sincronizar({ modo: 'completa', dryRun: true });
    expect(informe.totales.Computer).toMatchObject({ INACTIVAR: 1 });
    expect(informe.cambios).toEqual({ detectados: 1, aplicados: 0 });
    expect(e.local(8).inactivoDesde).toBeNull();
  });
});

describe('14 · ejecución automática', () => {
  it('registra cada ejecución con su origen y deja disponible la fecha de la última exitosa', async () => {
    const e = entorno({ origen: 'AUTOMATICA' });
    await e.sincronizar();
    e.pasan(15 * MIN);
    await e.sincronizar();
    e.pasan(15 * MIN);
    await e.sincronizar();

    expect(e.inv.ejecuciones.map((x) => [x.origen, x.modo, x.resultado?.estado])).toEqual([
      ['AUTOMATICA', 'COMPLETA', 'EXITOSA'],
      ['AUTOMATICA', 'INCREMENTAL', 'EXITOSA'],
      ['AUTOMATICA', 'INCREMENTAL', 'EXITOSA'],
    ]);
    expect(e.inv.ejecuciones.at(-1)!.resultado!.fin).toEqual(new Date(T0 + 30 * MIN));
    expect((await e.inv.puntoDeControl())!.puntoControl).toEqual(new Date(T0 + 30 * MIN));
  });

  it('si se añade un tipo nuevo a la configuración, la siguiente ejecución es completa', async () => {
    const e = entorno({ itemtypes: ['Computer'] });
    await e.sincronizar();
    e.pasan(MIN);
    const informe = await e.sincronizar({ itemtypes: ['Computer', 'NetworkEquipment'] });
    expect(informe.modo).toBe('COMPLETA');
    expect(e.inv.activos).toHaveLength(26);
  });
});

describe('15 · respuesta vacía válida frente a error de GLPI', () => {
  it('lista vacía con 200: "nada cambió" → ejecución correcta y el punto de control avanza', async () => {
    const e = entorno();
    await e.sincronizar();
    e.pasan(HORA);
    const informe = await e.sincronizar();
    expect(informe.errores).toEqual([]);
    expect(informe.totales.Computer!.leidos).toBe(0);
    expect(informe.puntoControl).toBe(new Date(T0 + HORA).toISOString());
    expect(e.inv.ejecuciones.at(-1)!.resultado!.estado).toBe('EXITOSA');
  });

  it('error 500 de GLPI: es un fallo → no se toca nada y el punto de control NO avanza', async () => {
    const e = entorno();
    await e.sincronizar();
    const antes = JSON.stringify(e.inv.activos);
    e.datos.rutasRotas = ['/v2/Assets/Computer', '/v2/Assets/NetworkEquipment'];
    e.pasan(HORA);
    const informe = await e.sincronizar();
    expect(informe.errores).toHaveLength(2);
    expect(informe.errores[0]).toContain('GLPI respondió 500');
    expect(informe.puntoControl).toBeNull();
    expect(JSON.stringify(e.inv.activos)).toBe(antes);
    expect(e.inv.ejecuciones.at(-1)!.resultado!.estado).toBe('FALLIDA');
    expect((await e.inv.puntoDeControl())!.puntoControl).toEqual(new Date(T0));
  });

  it('GLPI inalcanzable: tampoco avanza y queda registrado', async () => {
    const e = entorno();
    await e.sincronizar();
    e.falso.invalidarTokens();
    const sinRed = new Sincronizador(
      CONFIG_PRUEBA,
      new GlpiClient({
        ...CONFIG_PRUEBA,
        fetch: (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch,
      }),
      e.inv,
      () => {},
    );
    const informe = await sinRed.ejecutar();
    expect(informe.errores[0]).toContain('No se pudo contactar con GLPI');
    expect(informe.puntoControl).toBeNull();
    expect(e.inv.ejecuciones.at(-1)).toMatchObject({ enCurso: false, resultado: { estado: 'FALLIDA' } });
  });

  it('una zona horaria que no coincide con las fechas de GLPI se detecta y bloquea el punto de control', async () => {
    const e = entorno({ zonaHoraria: 'Europe/Madrid' });
    const informe = await e.sincronizar();
    expect(informe.errores[0]).toContain('GLPI_TIMEZONE="Europe/Madrid" no coincide');
    expect(informe.puntoControl).toBeNull();
  });
});
