import type { GlpiSyncConfig, Itemtype } from './config.js';
import type { GlpiClient, GlpiItem } from './glpi-client.js';
import {
  totalesVacios,
  type ElementoInforme,
  type Informe,
} from './informe.js';
import {
  claveCodigo,
  type Catalogos,
  type InventarioLocal,
} from './inventario-local.js';
import { mapearActivo, type ActivoGlpi } from './mapeo.js';
import {
  planificar,
  type ActivoLocal,
  type CandidatoEvaluado,
} from './plan.js';

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

/**
 * Motor de sincronización GLPI → inventario local, en dos fases:
 *
 *   1. LEER: token OAuth2 → por cada tipo, todos sus elementos en bloques de
 *      N → mapear y sanear. Con todo leído se sabe qué códigos se repiten.
 *   2. DECIDIR Y APLICAR: en bloques de N, comparar con la base (un activo se
 *      reconoce por su referencia de GLPI) y, si no es simulación, escribir
 *      con historial firmado por "GLPI".
 *
 * Nunca borra ni da de baja activos: que un elemento falte en una respuesta,
 * o que GLPI falle, no es una orden de borrado. Un fallo en un elemento no
 * detiene el resto: queda en el informe.
 */
export class Sincronizador {
  constructor(
    private readonly config: GlpiSyncConfig,
    private readonly glpi: GlpiClient,
    private readonly local: InventarioLocal,
    private readonly log: (linea: string) => void = console.log,
  ) {}

  async ejecutar(): Promise<Informe> {
    const informe: Informe = {
      inicio: new Date().toISOString(),
      fin: '',
      dryRun: this.config.dryRun,
      zonaHoraria: this.config.zonaHoraria,
      totales: {},
      elementos: [],
      lecturaParcial: this.config.maxPorTipo !== undefined,
      errores: [],
    };

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
      informe.errores.push(...faltan);
      // Simulando se sigue para ver el resto del informe; aplicando, no se escribe a medias.
      if (faltan.length === 0 || this.config.dryRun) {
        // Fase 1: leer. El token solo vive mientras se consulta GLPI.
        const lecturas = await this.glpi.conSesion(() => this.leerTodo(informe));
        // Fase 2: decidir y aplicar.
        const repetidos = this.valoresRepetidos(lecturas);
        const reservas: Reservas = { codigos: new Map(), manuales: new Map() };
        for (const lectura of lecturas) {
          await this.procesarTipo(lectura, catalogos, repetidos, reservas, informe);
        }
      }
    } catch (error) {
      informe.errores.push(mensaje(error));
    }

    informe.fin = new Date().toISOString();
    return informe;
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

  // ── Fase 1: leer ──────────────────────────────────────────────────────────

  /**
   * Lee todos los tipos configurados. Si la lectura de un tipo falla (red,
   * respuesta inesperada), ese tipo se descarta ENTERO: con datos a medias no
   * se puede saber qué códigos son únicos. Los demás tipos continúan.
   */
  private async leerTodo(informe: Informe): Promise<Lectura[]> {
    const lecturas: Lectura[] = [];
    const { tamanoBloque: tamano, maxPorTipo: max } = this.config;
    for (const itemtype of this.config.itemtypes) {
      informe.totales[itemtype] = totalesVacios();
      const lectura: Lectura = { itemtype, activos: [], invalidos: [] };
      try {
        let n = 0;
        for await (const bloque of this.glpi.listarPorBloques(itemtype, {
          tamano,
          max,
        })) {
          n += 1;
          this.log(`[glpi] ${itemtype}: bloque ${n} (${bloque.length} elementos)`);
          for (const item of bloque) this.mapear(itemtype, item, lectura);
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

  // ── Fase 2: decidir y aplicar ─────────────────────────────────────────────

  private async procesarTipo(
    lectura: Lectura,
    catalogos: Catalogos,
    repetidos: Map<string, string[]>,
    reservas: Reservas,
    informe: Informe,
  ): Promise<void> {
    const totales = informe.totales[lectura.itemtype]!;
    const anotar = (elemento: ElementoInforme) => {
      totales.leidos += 1;
      totales[elemento.resultado] += 1;
      informe.elementos.push(elemento);
    };
    lectura.invalidos.forEach(anotar);

    const { tamanoBloque } = this.config;
    for (let i = 0; i < lectura.activos.length; i += tamanoBloque) {
      const bloque = lectura.activos.slice(i, i + tamanoBloque);
      try {
        const elementos = await this.procesarBloque(
          lectura.itemtype,
          bloque,
          catalogos,
          repetidos,
          reservas,
        );
        elementos.forEach(anotar);
      } catch (error) {
        // Fallo al consultar la base para este bloque: se informa y se sigue.
        informe.errores.push(
          `${lectura.itemtype}: bloque ${i / tamanoBloque + 1} sin procesar. Causa: ${mensaje(error)}`,
        );
      }
    }
  }

  private async procesarBloque(
    itemtype: Itemtype,
    bloque: ActivoGlpi[],
    catalogos: Catalogos,
    repetidos: Map<string, string[]>,
    reservas: Reservas,
  ): Promise<ElementoInforme[]> {
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

      const candidatos: CandidatoEvaluado[] = glpi.candidatos.map((c) => ({
        ...c,
        repetidoEn: (
          repetidos.get(`${c.origen}:${claveCodigo(c.valor)}`) ?? []
        ).filter((referencia) => referencia !== glpi.referencia),
        conEseCodigo: conCodigo(c.valor),
        manuales: locales.filter(
          (l) =>
            !l.origenGlpi &&
            !l.deletedAt &&
            (igual(l.codigo, c.valor) ||
              igual(
                c.origen === 'inventario'
                  ? l.numeroInventario
                  : l.codigoInstitucional,
                c.valor,
              )),
        ),
      }));

      const plan = planificar(glpi, {
        vinculado: porReferencia.get(glpi.referencia) ?? null,
        candidatos,
        conCodigoRespaldo: conCodigo(glpi.codigoRespaldo),
        reservados: reservas,
      });
      // Lo decidido queda comprometido para el resto de la ejecución.
      if (plan.accion === 'CREAR') {
        reservas.codigos.set(claveCodigo(plan.codigo), glpi.referencia);
      } else if (plan.accion === 'ENLAZAR') {
        reservas.manuales.set(plan.local!.id, glpi.referencia);
      }

      elemento.codigo = plan.codigo;
      elemento.resultado = plan.accion;
      elemento.diferencias = plan.diferencias;
      elemento.motivo = plan.motivo;
      elemento.revision = [...glpi.revision, ...plan.revision];
      elemento.activoId = plan.local?.id;

      if (this.config.dryRun) continue;
      try {
        if (plan.accion === 'CREAR') {
          elemento.activoId = await this.local.crear(glpi, plan.codigo, {
            // Verificados en catalogosQueFaltan() antes de conectar con GLPI.
            categoriaId: catalogos.categorias.get(
              this.config.categoriaPorTipo[itemtype],
            )!,
            criticidadId: catalogos.criticidades.get(
              this.config.criticidadPorDefecto,
            )!,
          });
        } else if (plan.accion === 'ENLAZAR' || plan.accion === 'ACTUALIZAR') {
          await this.local.aplicar(plan.local!, glpi, plan);
        }
      } catch (error) {
        elemento.resultado = 'ERROR';
        elemento.error = mensaje(error);
      }
    }
    return resultados;
  }
}
