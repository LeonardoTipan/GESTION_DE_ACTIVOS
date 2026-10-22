import { Badge } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { Cierre, EstadoEquipo, Fase, ResultadoVerificacion, TipoMantenimiento } from '../api/mantenimientos.ts'
import { INFO_CIERRE, INFO_ESTADO_EQUIPO, INFO_FASE, INFO_RESULTADO_VERIFICACION, INFO_TIPO } from '../fases.ts'

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

/** Capa 3: verificación del trabajo (nada si no aplica). */
export function BadgeCierre({ cierre }: { cierre: Cierre }) {
  if (cierre === 'NO_APLICA') return null
  const { etiqueta, color } = INFO_CIERRE[cierre]
  return (
    <Badge color={color} variant="light">
      {etiqueta}
    </Badge>
  )
}

export function BadgeResultadoVerificacion({ resultado }: { resultado: ResultadoVerificacion }) {
  const { etiqueta, color } = INFO_RESULTADO_VERIFICACION[resultado]
  return (
    <Badge color={color} variant="filled">
      {etiqueta}
    </Badge>
  )
}
