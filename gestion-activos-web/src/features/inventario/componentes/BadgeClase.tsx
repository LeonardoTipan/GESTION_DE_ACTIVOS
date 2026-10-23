import { Badge } from '@mantine/core'
import { IconCode, IconCpu, IconHelpCircle } from '@tabler/icons-react'
import type { components } from '../../../api/schema'

export type ClaseActivo = NonNullable<components['schemas']['CategoriaDto']['claseMantenimiento']>

const INFO_CLASE_BADGE = {
  HARDWARE: { etiqueta: 'Hardware · físico', color: 'blue', icono: IconCpu },
  SOFTWARE: { etiqueta: 'Software · lógico', color: 'grape', icono: IconCode },
  SIN: { etiqueta: 'Sin clasificar', color: 'gray', icono: IconHelpCircle },
} as const

/**
 * Clase del activo, Hardware (físico) o Software (lógico), según su categoría: la
 * elige el admin en Catálogos, como las marcas de Control de acceso. Nunca se deduce
 * del nombre del activo. En mantenimiento decide los tipos permitidos.
 */
export function BadgeClase({ clase, size = 'sm' }: { clase: ClaseActivo | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const { etiqueta, color, icono: Icono } = INFO_CLASE_BADGE[clase ?? 'SIN']
  return (
    <Badge color={color} variant="light" size={size} leftSection={<Icono size={12} />} style={{ minWidth: 'max-content' }}>
      {etiqueta}
    </Badge>
  )
}
