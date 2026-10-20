import { Badge, Tooltip } from '@mantine/core'
import { IconClockExclamation } from '@tabler/icons-react'
import { formatearFechaHora } from '../../../shared/formato.ts'
import type {
  EstadoVulnerabilidad,
  NivelRiesgo,
  Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { INFO_ESTADO, INFO_NIVEL, semaforoSla } from '../riesgo.ts'

export function BadgeNivel({ nivel }: { nivel: NivelRiesgo }) {
  const { etiqueta, color } = INFO_NIVEL[nivel]
  return (
    <Badge color={color} variant={nivel === 'CRITICO' ? 'filled' : 'light'}>
      {etiqueta}
    </Badge>
  )
}

export function BadgeEstado({ estado }: { estado: EstadoVulnerabilidad }) {
  const { etiqueta, color } = INFO_ESTADO[estado]
  return (
    <Badge color={color} variant="light">
      {etiqueta}
    </Badge>
  )
}

/** Semáforo del plazo (SLA), con la fecha límite exacta en el tooltip. */
export function BadgeSla({
  vulnerabilidad,
}: {
  vulnerabilidad: Pick<Vulnerabilidad, 'estado' | 'fechaLimite' | 'fechaCierre'>
}) {
  const { tipo, color, etiqueta } = semaforoSla(vulnerabilidad)
  const badge = (
    <Badge
      color={color}
      variant={tipo === 'vencida' ? 'filled' : tipo.startsWith('cerrada') ? 'outline' : 'light'}
      leftSection={tipo === 'vencida' ? <IconClockExclamation size={12} /> : undefined}
    >
      {etiqueta}
    </Badge>
  )
  if (!vulnerabilidad.fechaLimite) return badge
  return (
    <Tooltip label={`Fecha límite: ${formatearFechaHora(vulnerabilidad.fechaLimite)}`}>
      {badge}
    </Tooltip>
  )
}
