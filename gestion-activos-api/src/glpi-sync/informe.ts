import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cambios } from '../inventory/bitacora/cambios.js';
import type { Itemtype } from './config.js';
import type {
  ModoEjecucion,
  OrigenEjecucion,
} from './inventario-local.js';
import type { Accion, Situacion } from './plan.js';

/** INACTIVAR / REACTIVAR: el activo cambia de situación (papelera, ausencia o regreso). */
export type Resultado = Accion | Situacion | 'ERROR';

export interface ElementoInforme {
  itemtype: Itemtype;
  glpiId: number;
  codigo: string;
  nombre: string;
  resultado: Resultado;
  /** Id del activo local (si existe o se creó). */
  activoId?: number;
  /** Diferencias local → GLPI detectadas. */
  diferencias: Cambios;
  /** Constancia de saneamientos (truncados, valores por defecto…). */
  avisos: string[];
  /** Casos que una persona debería revisar (códigos repetidos, vínculos dudosos…). */
  revision: string[];
  motivo?: string;
  error?: string;
  /** Lo que se detectó que había que hacer (se conserva aunque luego falle la escritura). */
  planificado?: Resultado;
  /** true = el cambio quedó ESCRITO en la base. En una simulación siempre es false. */
  aplicado?: boolean;
}

export type Totales = Record<Resultado | 'leidos', number>;

export interface Informe {
  inicio: string;
  fin: string;
  /** true = simulación: NO se escribió nada en la base. */
  dryRun: boolean;
  zonaHoraria: string;
  /** COMPLETA = todo el inventario; INCREMENTAL = solo lo modificado desde `desde`. */
  modo: ModoEjecucion;
  origen: OrigenEjecucion;
  /** Incremental: desde qué instante se pidieron los cambios (punto de control − ventana). */
  desde: string | null;
  /** Nuevo punto de control. null = NO avanzó (simulación, errores o lectura parcial). */
  puntoControl: string | null;
  /** true = no se ejecutó porque otra sincronización estaba escribiendo. */
  enCurso: boolean;
  /** Id de la fila de registro (solo en ejecuciones reales). */
  ejecucionId?: number;
  /** Cambios detectados en GLPI frente a los realmente escritos. */
  cambios: { detectados: number; aplicados: number };
  totales: Partial<Record<Itemtype, Totales>>;
  elementos: ElementoInforme[];
  /** true = se leyó solo una parte de GLPI (--max): la unicidad de los códigos es provisional. */
  lecturaParcial: boolean;
  /** Problemas generales (configuración, catálogos, conexión). */
  errores: string[];
}

export const totalesVacios = (): Totales => ({
  leidos: 0,
  CREAR: 0,
  ENLAZAR: 0,
  ACTUALIZAR: 0,
  SIN_CAMBIOS: 0,
  OMITIR: 0,
  INACTIVAR: 0,
  REACTIVAR: 0,
  ERROR: 0,
});

/** Resultados que suponen un cambio en la base. */
export const ES_CAMBIO: ReadonlySet<Resultado> = new Set([
  'CREAR',
  'ENLAZAR',
  'ACTUALIZAR',
  'INACTIVAR',
  'REACTIVAR',
]);

const texto = (valor: unknown): string =>
  valor === null || valor === undefined ? '∅' : String(valor);

/** Informe legible para la consola. */
export function formatearInforme(informe: Informe): string {
  const lineas: string[] = [];
  const modo = informe.dryRun
    ? 'SIMULACIÓN (dry-run): no se escribió nada en la base'
    : 'APLICADO: los cambios se escribieron en la base';
  lineas.push('', `══ Sincronización GLPI · ${modo} ══`);
  lineas.push(
    `Inicio ${informe.inicio} · Fin ${informe.fin} · Zona GLPI ${informe.zonaHoraria}`,
    informe.modo === 'INCREMENTAL'
      ? `Modo INCREMENTAL: solo lo modificado en GLPI desde ${informe.desde}`
      : `Modo COMPLETO: todo el inventario${informe.lecturaParcial ? '' : ' (con reconciliación de bajas)'}`,
    '',
  );

  const verbo = informe.dryRun
    ? { CREAR: 'se crearían', ENLAZAR: 'se enlazarían', ACTUALIZAR: 'se actualizarían' }
    : { CREAR: 'creados', ENLAZAR: 'enlazados', ACTUALIZAR: 'actualizados' };
  for (const [tipo, t] of Object.entries(informe.totales)) {
    lineas.push(
      `${tipo}: ${t.leidos} leídos → ${t.CREAR} ${verbo.CREAR}, ${t.ENLAZAR} ${verbo.ENLAZAR}, ` +
        `${t.ACTUALIZAR} ${verbo.ACTUALIZAR}, ${t.INACTIVAR} a No activo, ${t.REACTIVAR} reactivados, ` +
        `${t.SIN_CAMBIOS} sin cambios, ${t.OMITIR} omitidos, ${t.ERROR} con error`,
    );
  }
  lineas.push(
    '',
    `Cambios detectados: ${informe.cambios.detectados} · aplicados: ${informe.cambios.aplicados}`,
    informe.dryRun
      ? 'Punto de control: no se mueve (simulación).'
      : informe.puntoControl
        ? `Punto de control: avanza a ${informe.puntoControl}`
        : 'Punto de control: NO avanza (la próxima ejecución volverá a leer desde el anterior).',
  );

  if (informe.lecturaParcial) {
    lineas.push(
      '',
      'Lectura PARCIAL de GLPI (--max): la unicidad de los códigos solo se comprobó entre lo leído.',
    );
  }

  for (const e of informe.elementos) {
    if (e.resultado === 'SIN_CAMBIOS' && e.avisos.length === 0) continue;
    lineas.push(
      '',
      `[${e.resultado}] ${e.itemtype} #${e.glpiId} · ${e.codigo} · ${e.nombre}` +
        (e.activoId ? ` (activo local ${e.activoId})` : ''),
    );
    if (e.motivo) lineas.push(`    ${e.motivo}`);
    if (e.error) lineas.push(`    ERROR: ${e.error}`);
    for (const [campo, { antes, despues }] of Object.entries(e.diferencias)) {
      lineas.push(`    ≠ ${campo}: local "${texto(antes)}" → GLPI "${texto(despues)}"`);
    }
    for (const aviso of e.avisos) lineas.push(`    ⚠ ${aviso}`);
    if (e.revision.length > 0) lineas.push('    (ver "Requieren revisión manual")');
  }

  const porRevisar = informe.elementos.filter((e) => e.revision.length > 0);
  if (porRevisar.length > 0) {
    lineas.push('', `REQUIEREN REVISIÓN MANUAL (${porRevisar.length}):`);
    for (const e of porRevisar) {
      lineas.push(`  ${e.itemtype} #${e.glpiId} · ${e.codigo} · ${e.nombre}`);
      for (const caso of e.revision) lineas.push(`      - ${caso}`);
    }
  }

  if (informe.errores.length > 0) {
    lineas.push('', 'ERRORES GENERALES:');
    for (const error of informe.errores) lineas.push(`  ✗ ${error}`);
  }
  lineas.push('');
  return lineas.join('\n');
}

/** Guarda el informe completo en JSON (informe de auditoría). Devuelve la ruta. */
export async function guardarInforme(
  informe: Informe,
  directorio: string,
): Promise<string> {
  await mkdir(directorio, { recursive: true });
  const marca = informe.inicio.replace(/[:.]/g, '-');
  const sufijo = informe.dryRun ? 'simulacion' : 'aplicado';
  const ruta = join(directorio, `glpi-sync-${marca}-${sufijo}.json`);
  await writeFile(ruta, JSON.stringify(informe, null, 2), 'utf8');
  return ruta;
}
