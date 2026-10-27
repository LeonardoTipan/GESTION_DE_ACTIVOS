import { Badge, Tooltip } from '@mantine/core'
import { formatearFecha } from '../../shared/formato.ts'
import type { EstadoRenovacion, Renovacion } from './api.ts'
import { INFO_ESTADO, INFO_VIGENCIA, textoDias } from './textos.ts'

/** Estado del PROCESO (abierto, en progreso, cerrado). */
export function BadgeEstado({ estado }: { estado: EstadoRenovacion }) {
  const { etiqueta, color } = INFO_ESTADO[estado]
  return (
    <Badge color={color} variant="outline" style={{ minWidth: 'max-content' }}>
      {etiqueta}
    </Badge>
  )
}

/**
 * Vigencia del ELEMENTO hoy (vigente, próximo a caducar, caducado…), con la fecha
 * que rige y los días restantes en el tooltip. Es distinta del estado del proceso.
 */
export function BadgeVigencia({ r }: { r: Pick<Renovacion, 'vigencia' | 'venceEl' | 'diasRestantes' | 'sustituidaPor'> }) {
  const { etiqueta, color } = INFO_VIGENCIA[r.vigencia]
  const detalle =
    r.vigencia === 'SUSTITUIDA'
      ? `Hay una renovación posterior (#${r.sustituidaPor}): rige esa.`
      : r.venceEl
        ? `Vence el ${formatearFecha(r.venceEl)} · ${textoDias(r.diasRestantes)}`
        : 'Sin caducidad conocida o aplicable'
  return (
    <Tooltip label={detalle}>
      <Badge color={color} variant={r.vigencia === 'CADUCADA' ? 'filled' : 'light'} style={{ minWidth: 'max-content' }}>
        {etiqueta}
      </Badge>
    </Tooltip>
  )
}
