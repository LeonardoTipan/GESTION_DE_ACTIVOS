import type { GlpiSyncConfig, Itemtype } from './config.js';
import type { GlpiClient, GlpiItem } from './glpi-client.js';
import {
  ES_CAMBIO,
  totalesVacios,
  type ElementoInforme,
  type Informe,
} from './informe.js';
import {
  claveCodigo,
  EjecucionEnCursoError,
  type Catalogos,
  type ContadoresEjecucion,
  type InventarioLocal,
  type ModoEjecucion,
  type PuntoDeControl,
} from './inventario-local.js';
import { mapearActivo, type ActivoGlpi } from './mapeo.js';
import { TEXTO_MOTIVO } from './notificaciones.js';
import {
  MOTIVO_INACTIVO,
  planificar,
  type ActivoLocal,
  type CandidatoEvaluado,
  type Situacion,
} from './plan.js';
import { desfaseCoincide, fechaLocalDeZona } from './saneamiento.js';

const mensaje = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Lo leído de GLPI para un tipo. */
interface Lectura {
  itemtype: Itemtype;
  activos: ActivoGlpi[];
  /** Elementos con datos inválidos: van al informe como error, sin tocar la base. */
  invalidos: ElementoInforme[];
}

/** Códigos y activos manuales ya comprometidos durante la ejecución. */
interface Reservas {
  codigos: Map<string, string>;
  manuales: Map<number, string>;
}

/** Lo que comparten todos los bloques de una ejecución. */
interface Ejecucion {
  modo: ModoEjecucion;
  id?: number;
  catalogos: Catalogos;
  repetidos: Map<string, string[]>;
  reservas: Reservas;
}

/** Bajas por ausencia que se aplican sin pedir confirmación. */
const MIN_BAJAS_MASIVAS = 5;
const MAX_PORCENTAJE_BAJAS = 50;
/** Tope de elementos que se guardan en el resumen de la ejecución (columna TEXT). */
const MAX_RESUMEN = 150;

/**
 * Motor de sincronización GLPI → inventario local.
 *
 *   1. DECIDIR EL MODO: completa (todo el inventario) o incremental (solo lo
 *      modificado en GLPI desde el último punto de control, menos una ventana
 *      de seguridad).
 *   2. LEER: token OAuth2 → por cada tipo, sus elementos en bloques de N →
 *      mapear y sanear.
 *   3. DECIDIR Y APLICAR: comparar con la base (un activo se reconoce por su
 *      referencia de GLPI) y, si no es simulación, escribir con historial
 *      firmado por "GLPI" y un aviso por cada cambio real.
 *   4. RECONCILIAR (solo lectura completa y correcta): lo que ya no existe en
 *      GLPI pasa a "No activo".
 *
 * Nunca borra activos. Un equipo solo pasa a "No activo" si GLPI lo tiene en
 * la papelera o si una lectura COMPLETA y sin errores confirma que ya no
 * existe: jamás por un fallo de conexión, una lectura parcial o por no
 * aparecer en una consulta incremental.
 *
 * El punto de control solo avanza si la ejecución termina sin ningún error:
 * tras un fallo, la siguiente vuelve a leer desde el punto anterior.
 */
export class Sincronizador {
  constructor(
    private readonly config: GlpiSyncConfig,
    private readonly glpi: GlpiClient,
    private readonly local: InventarioLocal,
    private readonly log: (linea: string) => void = console.log,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(): Promise<Informe> {
    const inicio = this.ahora();
    const informe: Informe = {
      inicio: inicio.toISOString(),
      fin: '',
      dryRun: this.config.dryRun,
      zonaHoraria: this.config.zonaHoraria,
      modo: 'COMPLETA',
      origen: this.config.origen,
      desde: null,
      puntoControl: null,
      enCurso: false,
      cambios: { detectados: 0, aplicados: 0 },
      totales: {},
      elementos: [],
      lecturaParcial: this.config.maxPorTipo !== undefined,
      errores: [],
    };
    let marca: Date | null = null;

    try {
      const catalogos = await this.local.catalogos().catch((error: unknown) => {
        // El error de Prisma ocupa varias líneas con código fuente: basta la causa.
        const lineas = mensaje(error)
          .split('\n')
          .map((linea) => linea.trim())
          .filter(Boolean);
        const causa =
          lineas.find((linea) => /error/i.test(linea)) ?? lineas.at(-1) ?? '';
        throw new Error(
          `No se pudo leer la base de datos local (¿MySQL encendido? ¿DATABASE_URL correcta?): ${causa}`,
        );
      });
      const faltan = this.catalogosQueFaltan(catalogos);
      // Integridad: con registros huérfanos, un alta reutilizaría su id y los heredaría.
      const huerfanos = await this.local.huerfanos();
      if (huerfanos.length > 0) {
        faltan.push(
          `Integridad: hay registros que apuntan a activos inexistentes (${huerfanos
            .map((h) => `${h.cantidad} en ${h.tabla}`)
            .join(', ')}). ${
            this.config.dryRun
              ? 'Una sincronización real se negaría a escribir'
              : 'No se escribe nada'
          } hasta resolverlos (docs/glpi-diagnostico.sql, consulta 8).`,
        );
      }
      informe.errores.push(...faltan);
      // Simulando se sigue para ver el resto del informe; aplicando, no se escribe a medias.
      if (faltan.length === 0 || this.config.dryRun) {
        const previo = await this.local.puntoDeControl();
        informe.modo = this.decidirModo(previo, inicio);
        const desde =
          informe.modo === 'INCREMENTAL'
            ? new Date(
                previo!.puntoControl.getTime() -
                  this.config.ventanaSeguridadMin * 60_000,
              )
            : null;
        informe.desde = desde?.toISOString() ?? null;

        if (!this.config.dryRun) {
          // Toma el bloqueo: si otra ejecución está escribiendo, esta no empieza.
          informe.ejecucionId = await this.local.iniciarEjecucion({
            origen: this.config.origen,
            modo: informe.modo,
            tipos: this.config.itemtypes,
            solicitadaPor: this.config.solicitadaPor,
            inicio,
            caducaMin: this.config.bloqueoCaducaMin,
          });
        }

        // Candidato a punto de control: el instante ANTERIOR a leer GLPI. Lo que
        // cambie en GLPI mientras dura la ejecución lo recogerá la siguiente.
        marca = this.ahora();
        // El token solo vive mientras se consulta GLPI.
        const lecturas = await this.glpi.conSesion(() =>
          this.leerTodo(informe, desde),
        );
        const ejecucion: Ejecucion = {
          modo: informe.modo,
          id: informe.ejecucionId,
          catalogos,
          repetidos: this.valoresRepetidos(lecturas),
          reservas: { codigos: new Map(), manuales: new Map() },
        };
        for (const lectura of lecturas) {
          const procesado = await this.procesarTipo(lectura, ejecucion, informe);
          if (procesado && informe.modo === 'COMPLETA' && !informe.lecturaParcial) {
            await this.reconciliar(lectura, ejecucion, informe);
          }
        }
      }
    } catch (error) {
      if (error instanceof EjecucionEnCursoError) informe.enCurso = true;
      informe.errores.push(mensaje(error));
    }

    const fin = this.ahora();
    informe.fin = fin.toISOString();
    const conError = informe.elementos.filter((e) => e.resultado === 'ERROR');
    informe.cambios = {
      detectados: informe.elementos.filter(
        (e) => e.planificado && ES_CAMBIO.has(e.planificado),
      ).length,
      aplicados: informe.elementos.filter((e) => e.aplicado).length,
    };
    const limpia = informe.errores.length === 0 && conError.length === 0;

    if (informe.ejecucionId !== undefined) {
      // El punto de control SOLO avanza si no hubo ningún error ni lectura parcial.
      const puntoControl =
        limpia && !informe.lecturaParcial && marca ? marca : null;
      informe.puntoControl = puntoControl?.toISOString() ?? null;
      try {
        await this.local.finalizarEjecucion(informe.ejecucionId, {
          estado: limpia
            ? 'EXITOSA'
            : informe.elementos.length === 0
              ? 'FALLIDA'
              : 'CON_ERRORES',
          fin,
          puntoControl,
          contadores: this.contadores(informe),
          resumen: this.resumen(informe),
          aviso: limpia
            ? undefined
            : [
                ...informe.errores,
                ...conError.map(
                  (e) => `${e.itemtype} #${e.glpiId} (${e.codigo}): ${e.error}`,
                ),
              ]
                .slice(0, 10)
                .join('\n'),
        });
      } catch (error) {
        informe.puntoControl = null;
        informe.errores.push(
          `No se pudo registrar el resultado de la ejecución: ${mensaje(error)}`,
        );
      }
    }
    return informe;
  }

  /**
   * Completa si no hay de dónde partir, si se pide, o si toca la reconciliación
   * periódica (solo en ejecuciones no manuales: el botón es siempre rápido).
   */
  private decidirModo(previo: PuntoDeControl | null, ahora: Date): ModoEjecucion {
    const { modo, itemtypes, origen, reconciliacionHoras } = this.config;
    if (
      modo === 'completa' ||
      this.config.maxPorTipo !== undefined ||
      this.config.mejorarCodigos || // necesita ver TODOS los códigos de GLPI
      !previo ||
      // Se añadió un tipo: de ese no hay punto de partida.
      itemtypes.some((tipo) => !previo.tipos.includes(tipo))
    ) {
      return 'COMPLETA';
    }
    if (modo === 'incremental' || origen === 'MANUAL') return 'INCREMENTAL';
    const caduca =
      (previo.ultimaCompleta?.getTime() ?? 0) + reconciliacionHoras * 3_600_000;
    return caduca <= ahora.getTime() ? 'COMPLETA' : 'INCREMENTAL';
  }

  private catalogosQueFaltan(catalogos: Catalogos): string[] {
    const faltan: string[] = [];
    const { criticidadPorDefecto, categoriaPorTipo, itemtypes } = this.config;
    if (!catalogos.criticidades.has(criticidadPorDefecto)) {
      faltan.push(
        `La criticidad por defecto "${criticidadPorDefecto}" no existe en el catálogo (GLPI_CRITICIDAD_DEFECTO).`,
      );
    }
    for (const tipo of itemtypes) {
      if (!catalogos.categorias.has(categoriaPorTipo[tipo])) {
        faltan.push(
          `La categoría "${categoriaPorTipo[tipo]}" para ${tipo} no existe en el catálogo.`,
        );
      }
    }
    return faltan;
  }

  // ── Leer ──────────────────────────────────────────────────────────────────

  /**
   * Lee los tipos configurados: todo, o solo lo modificado desde `desde`.
   * Si la lectura de un tipo falla (red, respuesta inesperada o incompleta),
   * ese tipo se descarta ENTERO y queda como error: con datos a medias no se
   * puede saber qué códigos son únicos ni qué ha desaparecido. Los demás siguen.
   *
   * Una lista vacía con respuesta 200 es un resultado VÁLIDO ("nada cambió");
   * un error de GLPI nunca se confunde con ella.
   */
  private async leerTodo(informe: Informe, desde: Date | null): Promise<Lectura[]> {
    const lecturas: Lectura[] = [];
    const { tamanoBloque: tamano, maxPorTipo: max, zonaHoraria } = this.config;
    // GLPI interpreta la fecha del filtro en SU hora local (comprobado): se envía así.
    const modificados = desde
      ? `date_mod=ge=${fechaLocalDeZona(desde, zonaHoraria)}`
      : undefined;
    // La papelera se pide aparte y expresamente: así se detecta tanto si el
    // listado normal de GLPI la incluye como si la oculta.
    const filtros = [
      modificados,
      modificados ? `is_deleted==1;${modificados}` : 'is_deleted==1',
    ];
    let zonaComprobada = false;

    for (const itemtype of this.config.itemtypes) {
      informe.totales[itemtype] = totalesVacios();
      const lectura: Lectura = { itemtype, activos: [], invalidos: [] };
      const vistos = new Set<number>();
      try {
        for (const filtro of filtros) {
          let n = 0;
          for await (const bloque of this.glpi.listarPorBloques(itemtype, {
            tamano,
            max,
            filtro,
          })) {
            n += 1;
            this.log(
              `[glpi] ${itemtype}${filtro ? ` (${filtro})` : ''}: bloque ${n} (${bloque.length} elementos)`,
            );
            for (const item of bloque) {
              if (typeof item?.id === 'number' && vistos.has(item.id)) continue;
              if (typeof item?.id === 'number') vistos.add(item.id);
              if (!zonaComprobada && desfaseCoincide(item?.date_mod, zonaHoraria) !== null) {
                zonaComprobada = true;
                if (desfaseCoincide(item.date_mod, zonaHoraria) === false) {
                  informe.errores.push(
                    `GLPI_TIMEZONE="${zonaHoraria}" no coincide con el desfase de las fechas que envía GLPI (${String(item.date_mod)}): la consulta incremental podría perder cambios. Corrige la zona.`,
                  );
                }
              }
              this.mapear(itemtype, item, lectura);
            }
          }
        }
        lecturas.push(lectura);
      } catch (error) {
        informe.errores.push(
          `${itemtype}: no se pudo leer de GLPI y NO se procesó ningún elemento de este tipo (los activos locales no se tocan). Causa: ${mensaje(error)}`,
        );
      }
    }
    return lecturas;
  }

  /** Un elemento sin id válido no puede identificarse: se rechaza sin escribir nada. */
  private mapear(itemtype: Itemtype, item: GlpiItem, lectura: Lectura): void {
    const id: unknown = (item as { id?: unknown } | null)?.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      lectura.invalidos.push({
        itemtype,
        glpiId: 0,
        codigo: '—',
        nombre: '(elemento sin identificador)',
        resultado: 'ERROR',
        diferencias: {},
        avisos: [],
        revision: [],
        error: `GLPI devolvió un elemento sin "id" numérico válido (${JSON.stringify(id)}): no se puede identificar ni registrar.`,
      });
      return;
    }
    lectura.activos.push(
      mapearActivo(
        itemtype,
        item,
        this.config.zonaHoraria,
        this.config.codigoInstitucional,
      ),
    );
  }

  /**
   * Qué elementos de GLPI comparten cada valor candidato a código. Se cuenta
   * por separado el código institucional y el n.º de inventario, entre TODOS
   * los tipos leídos (un equipo de red puede repetir el de un ordenador).
   */
  private valoresRepetidos(
    lecturas: Lectura[],
  ): Map<string, string[]> {
    const usos = new Map<string, string[]>();
    for (const { activos } of lecturas) {
      for (const activo of activos) {
        if (activo.excluido) continue;
        for (const { origen, valor } of activo.candidatos) {
          const clave = `${origen}:${claveCodigo(valor)}`;
          usos.set(clave, [...(usos.get(clave) ?? []), activo.referencia]);
        }
      }
    }
    return usos;
  }

  // ── Decidir y aplicar ─────────────────────────────────────────────────────

  /** Devuelve false si algún bloque no pudo procesarse (no se reconcilia a medias). */
  private async procesarTipo(
    lectura: Lectura,
    ejecucion: Ejecucion,
    informe: Informe,
  ): Promise<boolean> {
    const anotar = (elemento: ElementoInforme) => this.anotar(informe, elemento);
    lectura.invalidos.forEach(anotar);
    let completo = lectura.invalidos.length === 0;

    const { tamanoBloque } = this.config;
    for (let i = 0; i < lectura.activos.length; i += tamanoBloque) {
      const bloque = lectura.activos.slice(i, i + tamanoBloque);
      try {
        const elementos = await this.procesarBloque(
          lectura.itemtype,
          bloque,
          ejecucion,
        );
        elementos.forEach(anotar);
      } catch (error) {
        completo = false;
        // Fallo al consultar la base para este bloque: se informa y se sigue.
        informe.errores.push(
          `${lectura.itemtype}: bloque ${i / tamanoBloque + 1} sin procesar. Causa: ${mensaje(error)}`,
        );
      }
    }
    return completo;
  }

  private anotar(informe: Informe, elemento: ElementoInforme): void {
    const totales = informe.totales[elemento.itemtype]!;
    totales.leidos += 1;
    totales[elemento.resultado] += 1;
    informe.elementos.push(elemento);
  }

  private async procesarBloque(
    itemtype: Itemtype,
    bloque: ActivoGlpi[],
    ejecucion: Ejecucion,
  ): Promise<ElementoInforme[]> {
    const { catalogos, repetidos, reservas } = ejecucion;
    // Una sola consulta a la base por bloque.
    const locales = await this.local.buscar(
      bloque.map((g) => g.referencia),
      bloque.flatMap((g) => [
        g.codigoRespaldo,
        ...g.candidatos.map((c) => c.valor),
      ]),
    );
    const porReferencia = new Map(
      locales.filter((l) => l.origenGlpi).map((l) => [l.origenGlpi!, l]),
    );
    const igual = (a: string | null, b: string) =>
      a !== null && claveCodigo(a) === claveCodigo(b);
    const conCodigo = (valor: string): ActivoLocal | null =>
      locales.find((l) => igual(l.codigo, valor)) ?? null;
    const campoDe = (l: ActivoLocal, origen: 'institucional' | 'inventario') =>
      origen === 'inventario' ? l.numeroInventario : l.codigoInstitucional;

    const resultados: ElementoInforme[] = [];
    for (const glpi of bloque) {
      const elemento: ElementoInforme = {
        itemtype,
        glpiId: glpi.glpiId,
        codigo: glpi.codigoRespaldo,
        nombre: glpi.alCrear.nombre,
        resultado: 'SIN_CAMBIOS',
        diferencias: {},
        avisos: glpi.avisos,
        revision: glpi.revision,
      };
      resultados.push(elemento);

      if (glpi.excluido) {
        elemento.resultado = 'OMITIR';
        elemento.motivo = glpi.excluido;
        continue;
      }

      const candidatos: CandidatoEvaluado[] = glpi.candidatos.map((c) => {
        const enGlpi = (
          repetidos.get(`${c.origen}:${claveCodigo(c.valor)}`) ?? []
        ).filter((referencia) => referencia !== glpi.referencia);
        // En una lectura incremental no se ve el resto de GLPI: los demás
        // elementos con ese valor se conocen por los activos ya sincronizados.
        const enLocal =
          ejecucion.modo === 'INCREMENTAL'
            ? locales
                .filter(
                  (l) =>
                    l.origenGlpi &&
                    l.origenGlpi !== glpi.referencia &&
                    igual(campoDe(l, c.origen), c.valor),
                )
                .map((l) => l.origenGlpi!)
            : [];
        return {
          ...c,
          repetidoEn: [...new Set([...enGlpi, ...enLocal])],
          conEseCodigo: conCodigo(c.valor),
          manuales: locales.filter(
            (l) =>
              !l.origenGlpi &&
              !l.deletedAt &&
              (igual(l.codigo, c.valor) || igual(campoDe(l, c.origen), c.valor)),
          ),
        };
      });

      const plan = planificar(glpi, {
        vinculado: porReferencia.get(glpi.referencia) ?? null,
        candidatos,
        conCodigoRespaldo: conCodigo(glpi.codigoRespaldo),
        mejorarCodigoDeRespaldo: this.config.mejorarCodigos,
        reservados: reservas,
      });
      // Lo decidido queda comprometido para el resto de la ejecución.
      if (plan.nuevoCodigo) {
        reservas.codigos.set(claveCodigo(plan.nuevoCodigo), glpi.referencia);
      }
      if (plan.accion === 'CREAR') {
        reservas.codigos.set(claveCodigo(plan.codigo), glpi.referencia);
      } else if (plan.accion === 'ENLAZAR') {
        reservas.manuales.set(plan.local!.id, glpi.referencia);
      }

      // Situación: GLPI dice expresamente si el elemento está en la papelera.
      let situacion: Situacion | undefined;
      if (plan.local && plan.accion !== 'OMITIR') {
        if (glpi.enPapelera && !plan.local.inactivoDesde) situacion = 'INACTIVAR';
        if (!glpi.enPapelera && plan.local.inactivoDesde) situacion = 'REACTIVAR';
      }

      elemento.codigo = plan.nuevoCodigo ?? plan.codigo;
      elemento.resultado = situacion ?? plan.accion;
      elemento.planificado = elemento.resultado;
      elemento.diferencias = {
        ...plan.diferencias,
        ...(situacion
          ? {
              situacion:
                situacion === 'INACTIVAR'
                  ? { antes: 'Activo', despues: 'No activo (papelera de GLPI)' }
                  : { antes: 'No activo', despues: 'Activo' },
            }
          : {}),
      };
      elemento.motivo =
        plan.accion === 'CREAR' && glpi.enPapelera
          ? 'Está en la papelera de GLPI: se registra como No activo.'
          : plan.motivo;
      elemento.revision = [...glpi.revision, ...plan.revision];
      elemento.activoId = plan.local?.id;

      if (this.config.dryRun) continue;
      const extra = { ejecucionId: ejecucion.id, situacion };
      try {
        if (plan.accion === 'CREAR') {
          elemento.activoId = await this.local.crear(
            glpi,
            plan.codigo,
            {
              // Verificados en catalogosQueFaltan() antes de conectar con GLPI.
              categoriaId: catalogos.categorias.get(
                this.config.categoriaPorTipo[itemtype],
              )!,
              criticidadId: catalogos.criticidades.get(
                this.config.criticidadPorDefecto,
              )!,
            },
            extra,
          );
          elemento.aplicado = true;
        } else if (
          plan.accion === 'ENLAZAR' ||
          plan.accion === 'ACTUALIZAR' ||
          situacion
        ) {
          await this.local.aplicar(plan.local!, glpi, plan, extra);
          elemento.aplicado = true;
        }
      } catch (error) {
        elemento.resultado = 'ERROR';
        elemento.error = mensaje(error);
      }
    }
    return resultados;
  }

  // ── Reconciliar ───────────────────────────────────────────────────────────

  /**
   * Tras una lectura COMPLETA y correcta de un tipo: los activos vinculados a
   * elementos que GLPI ya no devuelve pasan a "No activo". No se borra nada.
   *
   * Salvaguarda: si desaparece todo el tipo o buena parte de él, lo más
   * probable es un problema en GLPI (permisos, entidad) y no una baja real:
   * no se aplica y se informa, salvo confirmación expresa.
   */
  private async reconciliar(
    lectura: Lectura,
    ejecucion: Ejecucion,
    informe: Informe,
  ): Promise<void> {
    const { itemtype } = lectura;
    try {
      const enGlpi = new Set(lectura.activos.map((a) => a.referencia));
      const vigentes = (await this.local.vinculados(itemtype)).filter(
        (l) => !l.inactivoDesde,
      );
      const ausentes = vigentes.filter((l) => !enGlpi.has(l.origenGlpi!));
      if (ausentes.length === 0) return;

      const masiva =
        lectura.activos.length === 0 ||
        (ausentes.length >= MIN_BAJAS_MASIVAS &&
          ausentes.length * 100 > vigentes.length * MAX_PORCENTAJE_BAJAS);
      if (masiva && !this.config.confirmarBajasMasivas) {
        informe.errores.push(
          `${itemtype}: GLPI ya no devuelve ${ausentes.length} de los ${vigentes.length} activos vinculados. Parece un problema de GLPI (permisos, entidad) más que una baja real: NO se marcó ninguno como No activo. Si es correcto, ejecuta una sincronización completa con --confirmar-bajas.`,
        );
        return;
      }

      for (const local of ausentes) {
        const elemento: ElementoInforme = {
          itemtype,
          glpiId: Number(local.origenGlpi!.split('#')[1]),
          codigo: local.codigo,
          nombre: local.nombre,
          resultado: 'INACTIVAR',
          planificado: 'INACTIVAR',
          activoId: local.id,
          diferencias: {
            situacion: {
              antes: 'Activo',
              despues: `No activo (${TEXTO_MOTIVO[MOTIVO_INACTIVO.AUSENTE]})`,
            },
          },
          avisos: [],
          revision: [],
          motivo: `${local.origenGlpi} ya no existe en GLPI (confirmado con una lectura completa). El activo se conserva con su historial.`,
        };
        if (!this.config.dryRun) {
          try {
            await this.local.marcarAusente(local, ejecucion.id);
            elemento.aplicado = true;
          } catch (error) {
            elemento.resultado = 'ERROR';
            elemento.error = mensaje(error);
          }
        }
        // No se leyó de GLPI: cuenta en su resultado, no en "leídos".
        informe.totales[itemtype]![elemento.resultado] += 1;
        informe.elementos.push(elemento);
      }
    } catch (error) {
      informe.errores.push(
        `${itemtype}: no se pudo reconciliar con el inventario local. Causa: ${mensaje(error)}`,
      );
    }
  }

  // ── Registro de la ejecución ──────────────────────────────────────────────

  private contadores(informe: Informe): ContadoresEjecucion {
    const suma = (clave: keyof ReturnType<typeof totalesVacios>) =>
      Object.values(informe.totales).reduce((n, t) => n + t[clave], 0);
    return {
      leidos: suma('leidos'),
      creados: suma('CREAR'),
      actualizados: suma('ACTUALIZAR') + suma('ENLAZAR'),
      sinCambios: suma('SIN_CAMBIOS'),
      inactivados: suma('INACTIVAR'),
      reactivados: suma('REACTIVAR'),
      omitidos: suma('OMITIR'),
      errores: suma('ERROR') + informe.errores.length,
      porRevisar: informe.elementos.filter((e) => e.revision.length > 0).length,
      detectados: informe.cambios.detectados,
      aplicados: informe.cambios.aplicados,
    };
  }

  /** Lo que se guarda de la ejecución: errores y qué cambió en cada elemento. */
  private resumen(informe: Informe): object {
    const relevantes = informe.elementos.filter(
      (e) => e.resultado !== 'SIN_CAMBIOS',
    );
    return {
      desde: informe.desde,
      errores: informe.errores,
      cambios: relevantes.slice(0, MAX_RESUMEN).map((e) => ({
        referencia: `${e.itemtype} #${e.glpiId}`,
        activoId: e.activoId,
        codigo: e.codigo,
        nombre: e.nombre,
        resultado: e.resultado,
        aplicado: e.aplicado ?? false,
        campos: Object.keys(e.diferencias),
        error: e.error,
      })),
      omitidosDelResumen: Math.max(0, relevantes.length - MAX_RESUMEN),
    };
  }
}
