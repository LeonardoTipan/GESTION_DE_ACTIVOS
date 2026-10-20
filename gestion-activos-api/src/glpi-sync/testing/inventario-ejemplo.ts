import type { GlpiItem } from '../glpi-client.js';
import type { ReglaCodigoInstitucional } from '../mapeo.js';

/** La regla con la que la institución anota su código en el comentario de GLPI. */
export const REGLA: ReglaCodigoInstitucional = {
  etiqueta: 'QUITO TURISMO',
  formato: /^\d+(-\d+){3}$/,
};

/**
 * Reproduce la distribución REAL observada en GLPI (sin datos personales):
 * 25 ordenadores donde 22 comparten el n.º de inventario "001", dos el "002"
 * y uno no tiene; y códigos institucionales únicos, repetidos, precedidos de
 * "S/N:", mal formados o ausentes. [id, n.º de inventario, código institucional anotado]
 */
const ORDENADORES: [number, string, string | null][] = [
  [1, '001', '7-1-22-177'], // repetido con el #10
  [2, '001', '7-1-22-69'],
  [3, '001', '7-1-22-182'], // repetido con el #8
  [4, '001', null], // el comentario no lo menciona
  [5, '001', '7-1-22-185'],
  [6, '001', 'S/N: 7-1-22-183'], // lleva un prefijo delante del código
  [7, '001', 'S/N: 7-1-22-171'],
  [8, '001', '7-1-22-182'],
  [9, '002', '7-1-22-115'],
  [10, '002', '7-1-22-177'],
  [11, '001', 'S/N: 7-1-22-181'],
  [12, '001', 'S/N: 7-1-22-65'],
  [13, '001', 'S/N: 7-1-2-140'],
  [14, '001', '7-1-22-73'],
  [15, '001', '7-1-22-38'],
  [16, '001', '7-1-22-58'],
  [18, '001', '7-1-22-74'],
  [19, '001', '7-1-22-68'],
  [20, '001', '7-1-22-59'],
  [21, '001', '7-1-22-57'],
  [22, '001', '7-1-22-60'],
  [23, '001', '7-1722-47'], // formato irregular
  [24, '001', null],
  [25, '', null], // sin n.º de inventario
  [26, '001', '7-1-7-22--76'], // formato irregular
];

const comentario = (institucional: string | null): string =>
  [
    'Memoria RAM 16 GB',
    'Sistema Operativo Windows 11 Pro',
    ...(institucional === null ? [] : [`QUITO TURISMO: ${institucional}`]),
    '',
  ].join('\r\n');

export function ordenador(
  id: number,
  inventario: string,
  institucional: string | null,
): GlpiItem {
  return {
    id,
    name: `Laptop ${id}`,
    comment: comentario(institucional),
    contact: `usuario${id}`,
    serial: `SERIE-${id}`,
    otherserial: inventario,
    is_deleted: false,
    date_creation: '2026-05-11T13:56:57-05:00',
    date_mod: '2026-05-14T10:02:24-05:00',
    status: { id: 3, name: 'Bueno' },
    manufacturer: { id: 1, name: 'Fabricante' },
    user: { id: 30 + id, name: `usuario${id}` },
    user_tech: { id: 114, name: 'soporte' },
    location: { id: 11, name: 'TICs' },
    type: { id: 2, name: 'Laptop' },
    model: { id: 1, name: `Modelo ${id}` },
    network: { id: 2, name: 'SI' },
  };
}

/** Los 25 ordenadores del inventario de ejemplo. */
export const ordenadores = (): GlpiItem[] =>
  ORDENADORES.map(([id, inventario, institucional]) =>
    ordenador(id, inventario, institucional),
  );

/** El único equipo de red: comparte el n.º de inventario "001" y el id 1. */
export const equipoDeRed = (): GlpiItem => ({
  ...ordenador(1, '001', '7-1-14-6'),
  name: 'Central Telefónica',
  type: null,
  network: null,
});

/**
 * Código operativo esperado de cada ordenador: el institucional cuando es
 * válido y único; si no, el de respaldo (el n.º de inventario está repetido).
 */
export const CODIGOS_ESPERADOS: Record<number, string> = Object.fromEntries(
  ORDENADORES.map(([id, , institucional]) => {
    const repetido =
      ORDENADORES.filter(([, , otro]) => otro === institucional).length > 1;
    const valido =
      institucional !== null && REGLA.formato.test(institucional) && !repetido;
    return [id, valido ? institucional : `GLPI-PC-${id}`];
  }),
);
