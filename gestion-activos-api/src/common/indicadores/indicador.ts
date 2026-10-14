import { ApiProperty } from '@nestjs/swagger';

export type EstadoIndicador = 'EN_META' | 'EN_OBSERVACION' | 'FUERA_DE_META' | 'SIN_DATOS';

/** Un indicador de cumplimiento con su fórmula, meta y control ISO/IEC 27001:2022. */
export class IndicadorDto {
  @ApiProperty({ example: 'RES-01' })
  id: string;

  @ApiProperty({ example: 'Tasa de éxito de respaldos' })
  nombre: string;

  @ApiProperty({ example: 'A.8.13', description: 'Control del Anexo A de ISO/IEC 27001:2022.' })
  control: string;

  @ApiProperty({ example: '%', description: '"%", "min", "días" o "" (recuento).' })
  unidad: string;

  @ApiProperty({ type: Number, nullable: true, description: 'null = sin datos en el período.' })
  valor: number | null;

  @ApiProperty({ example: 98 })
  meta: number;

  @ApiProperty({ enum: ['subir', 'bajar'], description: '"bajar" = cuanto menor, mejor.' })
  direccion: 'subir' | 'bajar';

  @ApiProperty({ enum: ['EN_META', 'EN_OBSERVACION', 'FUERA_DE_META', 'SIN_DATOS'] })
  estado: EstadoIndicador;

  @ApiProperty({ description: 'Avance hacia la meta, de 0 a 100 (para la barra).' })
  progreso: number;

  @ApiProperty({ example: 'respaldos exitosos ÷ respaldos ejecutados × 100 = 12/13' })
  formula: string;

  @ApiProperty({ type: String, nullable: true, description: 'Qué falla, cuando no se cumple la meta.' })
  hallazgo: string | null;
}

/** Porcentaje con un decimal; null si no hay base sobre la que calcularlo. */
export const porcentaje = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

/**
 * Construye un indicador y calcula su estado: en meta, en observación (a menos
 * del 10 % de la meta) o fuera de meta. Mismo criterio que el prototipo.
 */
export function indicador(o: {
  id: string;
  nombre: string;
  control: string;
  unidad: string;
  valor: number | null;
  meta: number;
  direccion?: 'subir' | 'bajar';
  formula: string;
  hallazgo?: string;
}): IndicadorDto {
  const direccion = o.direccion ?? 'subir';
  const { valor: v, meta: m } = o;
  const sube = direccion === 'subir';
  let estado: EstadoIndicador = 'FUERA_DE_META';
  if (v === null) estado = 'SIN_DATOS';
  else if (sube ? v >= m : v <= m) estado = 'EN_META';
  else if (sube ? v >= m * 0.9 : v <= m + Math.max(1, m * 0.5)) estado = 'EN_OBSERVACION';

  let progreso = 0;
  if (v !== null) {
    progreso = sube
      ? m > 0 ? (v / m) * 100 : 100
      : v <= m ? 100 : Math.max(8, 100 - ((v - m) / Math.max(1, m || v)) * 100);
  }
  return {
    id: o.id,
    nombre: o.nombre,
    control: o.control,
    unidad: o.unidad,
    valor: v,
    meta: m,
    direccion,
    estado,
    progreso: Math.round(Math.max(0, Math.min(100, progreso))),
    formula: o.formula,
    hallazgo: estado === 'EN_META' || estado === 'SIN_DATOS' ? null : (o.hallazgo ?? null),
  };
}

/** Período pedido o, si falta, el trimestre natural en curso; "hasta" incluye todo ese día. */
export function periodoOTrimestre(desde?: Date, hasta?: Date): { desde: Date; hasta: Date } {
  const hoy = new Date();
  const q = Math.floor(hoy.getUTCMonth() / 3);
  const ini = desde ?? new Date(Date.UTC(hoy.getUTCFullYear(), q * 3, 1));
  const fin = hasta ?? new Date(Date.UTC(hoy.getUTCFullYear(), q * 3 + 3, 0));
  return { desde: ini, hasta: new Date(fin.getTime() + 24 * 3_600_000 - 1) };
}

/** "2026-10-14": la parte de fecha (UTC) de un instante. */
export const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10);
