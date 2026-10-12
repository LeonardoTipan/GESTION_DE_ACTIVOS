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
import { planificar } from './plan.js';

const mensaje = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Motor de sincronización GLPI → inventario local.
 *
 *   token OAuth2 → por cada tipo, bloques de N → mapear y sanear → comparar
 *   con el activo local del mismo código → (si no es simulación) aplicar con
 *   historial firmado por "GLPI" → informe.
 *
 * Un fallo en un elemento no detiene el resto: queda en el informe.
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
        await this.glpi.conSesion(async () => {
          /** Código → elemento de GLPI que lo recibió en esta ejecución (n.º de inventario repetidos). */
          const asignados = new Map<string, string>();
          for (const itemtype of this.config.itemtypes) {
            await this.sincronizarTipo(itemtype, catalogos, asignados, informe);
          }
        });
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

  private async sincronizarTipo(
    itemtype: Itemtype,
    catalogos: Catalogos,
    asignados: Map<string, string>,
    informe: Informe,
  ): Promise<void> {
    const totales = (informe.totales[itemtype] = totalesVacios());
    const { tamanoBloque: tamano, maxPorTipo: max } = this.config;
    try {
      let n = 0;
      for await (const bloque of this.glpi.listarPorBloques(itemtype, {
        tamano,
        max,
      })) {
        n += 1;
        this.log(`[glpi] ${itemtype}: bloque ${n} (${bloque.length} elementos)`);
        const elementos = await this.procesarBloque(
          itemtype,
          bloque,
          catalogos,
          asignados,
        );
        for (const elemento of elementos) {
          totales.leidos += 1;
          totales[elemento.resultado] += 1;
          informe.elementos.push(elemento);
        }
      }
    } catch (error) {
      // Lo ya procesado se conserva; el resto de tipos continúa.
      informe.errores.push(`${itemtype}: ${mensaje(error)}`);
    }
  }

  private async procesarBloque(
    itemtype: Itemtype,
    bloque: GlpiItem[],
    catalogos: Catalogos,
    asignados: Map<string, string>,
  ): Promise<ElementoInforme[]> {
    const mapeados: ActivoGlpi[] = bloque.map((item) =>
      mapearActivo(itemtype, item, this.config.zonaHoraria),
    );

    // Una sola consulta a la base por bloque.
    const locales = await this.local.buscar(
      mapeados.map((m) => m.referencia),
      mapeados.flatMap((m) => [m.codigo, m.codigoGenerado]),
    );

    const resultados: ElementoInforme[] = [];
    for (const glpi of mapeados) {
      const elemento: ElementoInforme = {
        itemtype,
        glpiId: glpi.glpiId,
        codigo: glpi.codigo,
        nombre: glpi.alCrear.nombre,
        resultado: 'SIN_CAMBIOS',
        diferencias: {},
        avisos: glpi.avisos,
      };
      resultados.push(elemento);

      if (glpi.excluido) {
        elemento.resultado = 'OMITIR';
        elemento.motivo = glpi.excluido;
        continue;
      }

      const enlazado = locales.porReferencia.get(glpi.referencia) ?? null;
      const conMismoCodigo =
        locales.porCodigo.get(claveCodigo(glpi.codigo)) ?? null;
      const plan = planificar(glpi, {
        enlazado,
        conMismoCodigo,
        asignadoEnEstaEjecucion: asignados.get(claveCodigo(glpi.codigo)),
        conCodigoGenerado:
          locales.porCodigo.get(claveCodigo(glpi.codigoGenerado)) ?? null,
      });
      // El código queda reservado para este elemento durante toda la ejecución.
      if (plan.accion === 'CREAR' || plan.accion === 'ENLAZAR') {
        asignados.set(claveCodigo(plan.codigo), glpi.referencia);
      }
      const local = enlazado ?? (plan.accion === 'ENLAZAR' ? conMismoCodigo : null);
      elemento.codigo = plan.codigo;
      elemento.resultado = plan.accion;
      elemento.diferencias = plan.diferencias;
      elemento.motivo = plan.motivo;
      elemento.avisos = [...plan.avisos, ...glpi.avisos];
      elemento.activoId = local?.id;

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
          await this.local.aplicar(local!, glpi, plan);
        }
      } catch (error) {
        elemento.resultado = 'ERROR';
        elemento.error = mensaje(error);
      }
    }
    return resultados;
  }
}
