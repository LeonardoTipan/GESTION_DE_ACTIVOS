import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cambios } from '../inventory/bitacora/cambios.js';
import type { Itemtype } from './config.js';
import type { Accion } from './plan.js';

export type Resultado = Accion | 'ERROR';

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
}

export type Totales = Record<Resultado | 'leidos', number>;

export interface Informe {
  inicio: string;
  fin: string;
  /** true = simulación: NO se escribió nada en la base. */
  dryRun: boolean;
  zonaHoraria: string;
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
  ERROR: 0,
});

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
    '',
  );

  const verbo = informe.dryRun
    ? { CREAR: 'se crearían', ENLAZAR: 'se enlazarían', ACTUALIZAR: 'se actualizarían' }
    : { CREAR: 'creados', ENLAZAR: 'enlazados', ACTUALIZAR: 'actualizados' };
  for (const [tipo, t] of Object.entries(informe.totales)) {
    lineas.push(
      `${tipo}: ${t.leidos} leídos → ${t.CREAR} ${verbo.CREAR}, ${t.ENLAZAR} ${verbo.ENLAZAR}, ` +
        `${t.ACTUALIZAR} ${verbo.ACTUALIZAR}, ${t.SIN_CAMBIOS} sin cambios, ${t.OMITIR} omitidos, ${t.ERROR} con error`,
    );
  }

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
