import { Badge } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { EstadoEquipo, Fase, TipoMantenimiento } from '../api/mantenimientos.ts'
import { INFO_ESTADO_EQUIPO, INFO_FASE, INFO_TIPO } from '../fases.ts'

export function BadgeFase({ fase }: { fase: Fase }) {
  const { etiqueta, color } = INFO_FASE[fase]
  return (
    <Badge color={color} variant="light">
      {etiqueta}
    </Badge>
  )
}

export function BadgeTipo({ tipo }: { tipo: TipoMantenimiento }) {
  const { etiqueta, color } = INFO_TIPO[tipo]
  return (
    <Badge color={color} variant="outline">
      {etiqueta}
    </Badge>
  )
}

export function BadgeEstadoEquipo({ estado }: { estado: EstadoEquipo | null }) {
  if (!estado) return null
  const { etiqueta, color } = INFO_ESTADO_EQUIPO[estado]
  return (
    <Badge color={color} variant="dot">
      {etiqueta}
    </Badge>
  )
}

/** PROGRAMADO con la fecha ya pasada (lo calcula la API). */
export function BadgeVencido() {
  return (
    <Badge color="red" variant="filled" leftSection={<IconAlertTriangle size={12} />}>
      Vencido
    </Badge>
  )
}
