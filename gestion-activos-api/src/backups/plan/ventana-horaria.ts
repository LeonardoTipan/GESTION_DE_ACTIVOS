import { horaLocal } from '../../common/plazos/plazos.js';
import type { VentanaRespaldo } from '../../generated/prisma/enums.js';

/** Las ventanas horarias de los planes de respaldo, en hora local de la institución. */
export const TEXTO_VENTANA: Record<VentanaRespaldo, string> = {
  NOCTURNA_22_02: 'nocturna 22:00–02:00',
  NOCTURNA_00_04: 'nocturna 00:00–04:00',
  FIN_DE_SEMANA: 'fin de semana',
  HORARIO_LABORAL: 'horario laboral (lunes a viernes, 08:00–18:00)',
  CONTINUA: 'continua',
};

/** ¿La hora real cae dentro de la ventana horaria del plan? */
export function dentroDeVentana(ventana: VentanaRespaldo, fecha: Date, zona?: string): boolean {
  const { diaSemana, minutos } = horaLocal(fecha, zona);
  switch (ventana) {
    case 'NOCTURNA_22_02':
      return minutos >= 22 * 60 || minutos < 2 * 60;
    case 'NOCTURNA_00_04':
      return minutos < 4 * 60;
    case 'FIN_DE_SEMANA':
      return diaSemana === 0 || diaSemana === 6;
    case 'HORARIO_LABORAL':
      return diaSemana >= 1 && diaSemana <= 5 && minutos >= 8 * 60 && minutos < 18 * 60;
    case 'CONTINUA':
      return true;
  }
}
