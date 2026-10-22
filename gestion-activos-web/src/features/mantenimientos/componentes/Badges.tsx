import { Badge } from '@mantine/core'
import { IconAlertTriangle, IconCode, IconCpu, IconHelpCircle } from '@tabler/icons-react'
import type { ClaseMantenimiento, EstadoEquipo, Fase, TipoMantenimiento } from '../api/mantenimientos.ts'
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
    // Sin recortar: «PRE…» no distinguiría Preventivo de Predictivo.
    <Badge color={color} variant="outline" style={{ minWidth: 'max-content' }}>
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

const INFO_CLASE_BADGE = {
  HARDWARE: { etiqueta: 'Hardware · físico', color: 'blue', icono: IconCpu },
  SOFTWARE: { etiqueta: 'Software · lógico', color: 'grape', icono: IconCode },
  SIN: { etiqueta: 'Sin clasificar', color: 'gray', icono: IconHelpCircle },
} as const

/**
 * Clase del activo para el mantenimiento, según su categoría (la elige el admin en
 * Catálogos, como las marcas de Control de acceso). Decide los tipos permitidos.
 */
export function BadgeClase({ clase, size = 'sm' }: { clase: ClaseMantenimiento | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const { etiqueta, color, icono: Icono } = INFO_CLASE_BADGE[clase ?? 'SIN']
  return (
    <Badge color={color} variant="light" size={size} leftSection={<Icono size={12} />} style={{ minWidth: 'max-content' }}>
      {etiqueta}
    </Badge>
  )
}
