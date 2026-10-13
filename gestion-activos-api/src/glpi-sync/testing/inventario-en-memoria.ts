import type { GlpiSyncConfig, Itemtype } from '../config.js';
import {
  ActivoDuplicadoError,
  claveCodigo,
  EjecucionEnCursoError,
  type Catalogos,
  type ExtraEscritura,
  type InicioEjecucion,
  type InventarioLocal,
  type PuntoDeControl,
  type ResultadoEjecucion,
} from '../inventario-local.js';
import type { ActivoGlpi } from '../mapeo.js';
import {
  notificacionDeCambio,
  type NotificacionNueva,
} from '../notificaciones.js';
import {
  MOTIVO_INACTIVO,
  RESPONSABLE_GLPI,
  type ActivoLocal,
  type Plan,
} from '../plan.js';
import { CREDENCIALES_PRUEBA } from './glpi-falso.js';
import { REGLA } from './inventario-ejemplo.js';

const VACIOS = {
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
  deletedAt: null,
  inactivoDesde: null,
  motivoInactivo: null,
};

export interface EjecucionEnMemoria extends InicioEjecucion {
  id: number;
  enCurso: boolean;
  resultado?: ResultadoEjecucion;
}

/**
 * Inventario en memoria con las MISMAS restricciones que MySQL: código y
 * referencia de GLPI únicos, y una sola ejecución en curso. Así se prueban
 * también la concurrencia y el bloqueo sin base de datos.
 */
export class InventarioEnMemoria implements InventarioLocal {
  activos: ActivoLocal[] = [];
  historial: { activoId: number; accion: string; responsable: string }[] = [];
  notificaciones: (NotificacionNueva & { activoId?: number; leida: boolean })[] = [];
  ejecuciones: EjecucionEnMemoria[] = [];
  private siguienteId = 100;
  /** Registros que apuntan a activos inexistentes (simulados). */
  registrosHuerfanos: { tabla: string; cantidad: number }[] = [];
  /** Referencias de GLPI cuya escritura debe fallar (simula un fallo parcial). */
  fallarEn = new Set<string>();

  huerfanos() {
    return Promise.resolve(this.registrosHuerfanos);
  }

  catalogos(): Promise<Catalogos> {
    return Promise.resolve({
      categorias: new Map([['Hardware', 1], ['Red', 2], ['Software', 3]]),
      criticidades: new Map([['Baja', 1], ['Media', 2], ['Alta', 3]]),
    });
  }

  async buscar(referencias: string[], valores: string[]): Promise<ActivoLocal[]> {
    await Promise.resolve(); // cede el turno, como una consulta real
    const claves = new Set(valores.map(claveCodigo));
    const coincide = (v: string | null) => v !== null && claves.has(claveCodigo(v));
    return this.activos
      .filter(
        (a) =>
          (a.origenGlpi !== null && referencias.includes(a.origenGlpi)) ||
          coincide(a.codigo) ||
          coincide(a.numeroInventario) ||
          coincide(a.codigoInstitucional),
      )
      .map((a) => ({ ...a }));
  }

  private comprobarFallo(glpi: ActivoGlpi): void {
    if (this.fallarEn.has(glpi.referencia)) {
      throw new Error(`Fallo simulado al escribir ${glpi.referencia}`);
    }
  }

  async crear(glpi: ActivoGlpi, codigo: string): Promise<number> {
    await Promise.resolve();
    this.comprobarFallo(glpi);
    if (
      this.activos.some(
        (a) =>
          a.origenGlpi === glpi.referencia ||
          claveCodigo(a.codigo) === claveCodigo(codigo),
      )
    ) {
      throw new ActivoDuplicadoError(glpi.referencia);
    }
    const id = this.siguienteId++;
    const { ultimaRevision: _, ...campos } = glpi.alCrear;
    this.activos.push({
      ...VACIOS,
      id,
      codigo,
      origenGlpi: glpi.referencia,
      ...campos,
      ...(glpi.enPapelera
        ? { inactivoDesde: new Date(), motivoInactivo: MOTIVO_INACTIVO.PAPELERA }
        : {}),
    });
    this.historial.push({ activoId: id, accion: 'CREAR', responsable: RESPONSABLE_GLPI });
    this.notificaciones.push({
      ...notificacionDeCambio({
        codigo,
        nombre: campos.nombre,
        accion: 'CREAR',
        cambios: {},
      }),
      activoId: id,
      leida: false,
    });
    return id;
  }

  async aplicar(
    local: ActivoLocal,
    glpi: ActivoGlpi,
    plan: Plan,
    extra: ExtraEscritura = {},
  ): Promise<void> {
    await Promise.resolve();
    this.comprobarFallo(glpi);
    const activo = this.activos.find((a) => a.id === local.id)!;
    if (plan.accion === 'ENLAZAR') {
      if (activo.origenGlpi) throw new Error('ya vinculado');
      activo.origenGlpi = glpi.referencia;
    }
    Object.assign(activo, glpi.datos);
    if (plan.nuevoCodigo) activo.codigo = plan.nuevoCodigo;
    if (extra.situacion === 'INACTIVAR') {
      activo.inactivoDesde = new Date();
      activo.motivoInactivo = MOTIVO_INACTIVO.PAPELERA;
    } else if (extra.situacion === 'REACTIVAR') {
      activo.inactivoDesde = null;
      activo.motivoInactivo = null;
    }
    this.historial.push({
      activoId: local.id,
      accion: extra.situacion ?? 'ACTUALIZAR',
      responsable: RESPONSABLE_GLPI,
    });
    this.notificaciones.push({
      ...notificacionDeCambio({
        codigo: activo.codigo,
        nombre: activo.nombre,
        accion: plan.accion === 'ENLAZAR' ? 'ENLAZAR' : 'ACTUALIZAR',
        situacion: extra.situacion,
        motivo: MOTIVO_INACTIVO.PAPELERA,
        cambios: plan.diferencias,
      }),
      activoId: local.id,
      leida: false,
    });
  }

  async marcarAusente(local: ActivoLocal): Promise<void> {
    await Promise.resolve();
    const activo = this.activos.find((a) => a.id === local.id)!;
    if (activo.deletedAt || activo.inactivoDesde) return;
    activo.inactivoDesde = new Date();
    activo.motivoInactivo = MOTIVO_INACTIVO.AUSENTE;
    this.historial.push({ activoId: local.id, accion: 'INACTIVAR', responsable: RESPONSABLE_GLPI });
    this.notificaciones.push({
      ...notificacionDeCambio({
        codigo: activo.codigo,
        nombre: activo.nombre,
        accion: 'ACTUALIZAR',
        situacion: 'INACTIVAR',
        motivo: MOTIVO_INACTIVO.AUSENTE,
        cambios: {},
      }),
      activoId: local.id,
      leida: false,
    });
  }

  vinculados(itemtype: Itemtype): Promise<ActivoLocal[]> {
    return Promise.resolve(
      this.activos
        .filter((a) => a.origenGlpi?.startsWith(`${itemtype} #`) && !a.deletedAt)
        .map((a) => ({ ...a })),
    );
  }

  puntoDeControl(): Promise<PuntoDeControl | null> {
    const exitosas = this.ejecuciones.filter(
      (e) => e.resultado?.estado === 'EXITOSA' && e.resultado.puntoControl,
    );
    const ultima = exitosas.at(-1);
    if (!ultima) return Promise.resolve(null);
    return Promise.resolve({
      puntoControl: ultima.resultado!.puntoControl!,
      tipos: ultima.tipos,
      ultimaCompleta: exitosas.findLast((e) => e.modo === 'COMPLETA')?.inicio ?? null,
    });
  }

  async iniciarEjecucion(datos: InicioEjecucion): Promise<number> {
    await Promise.resolve();
    const activa = this.ejecuciones.find((e) => e.enCurso);
    if (activa) {
      const caduca = activa.inicio.getTime() + datos.caducaMin * 60_000;
      if (caduca > Date.now()) throw new EjecucionEnCursoError(activa.inicio);
      activa.enCurso = false; // bloqueo abandonado
    }
    const id = this.ejecuciones.length + 1;
    this.ejecuciones.push({ ...datos, id, enCurso: true });
    return id;
  }

  finalizarEjecucion(id: number, resultado: ResultadoEjecucion): Promise<void> {
    const ejecucion = this.ejecuciones.find((e) => e.id === id)!;
    ejecucion.enCurso = false;
    ejecucion.resultado = resultado;
    if (resultado.aviso) {
      const anterior = this.notificaciones.findLast(
        (n) => n.tipo === 'ERROR_SINCRONIZACION',
      );
      const detalle = { mensaje: resultado.aviso };
      const repetido =
        anterior &&
        !anterior.leida &&
        JSON.stringify(anterior.detalle) === JSON.stringify(detalle);
      if (!repetido) {
        this.notificaciones.push({
          tipo: 'ERROR_SINCRONIZACION',
          titulo: 'La sincronización con GLPI terminó con errores',
          detalle,
          leida: false,
        });
      }
    }
    return Promise.resolve();
  }

  /** Activo registrado a mano. */
  manual(extra: Partial<ActivoLocal>): ActivoLocal {
    const activo: ActivoLocal = {
      ...VACIOS,
      id: this.siguienteId++,
      codigo: 'MANUAL',
      origenGlpi: null,
      nombre: 'Equipo registrado a mano',
      sistemas: 'Windows 10',
      custodio: 'Juan Pérez',
      ubicacion: 'Gerencia',
      cifrado: true,
      ...extra,
    };
    this.activos.push(activo);
    return activo;
  }
}

/** Configuración base de las pruebas: escribe (dryRun false) y decide el modo sola. */
export const CONFIG_PRUEBA: GlpiSyncConfig = {
  apiUrl: 'https://glpi.test/api.php',
  apiVersion: 'v2',
  ignorarSsl: false,
  credenciales: CREDENCIALES_PRUEBA,
  zonaHoraria: 'America/Guayaquil',
  itemtypes: ['Computer', 'NetworkEquipment'],
  tamanoBloque: 50,
  dryRun: false,
  mejorarCodigos: false,
  modo: 'auto',
  origen: 'CONSOLA',
  ventanaSeguridadMin: 15,
  reconciliacionHoras: 24,
  bloqueoCaducaMin: 30,
  confirmarBajasMasivas: false,
  cron: '*/15 * * * *',
  criticidadPorDefecto: 'Media',
  codigoInstitucional: REGLA,
  categoriaPorTipo: { Computer: 'Hardware', NetworkEquipment: 'Red', Software: 'Software' },
  dirInformes: 'glpi-informes',
  timeoutMs: 1000,
  databaseUrl: 'mysql://no-se-usa',
};
