import { Badge } from '@mantine/core'
import { colorCriticidad } from './colores.ts'

export function BadgeCriticidad({ nivel }: { nivel: string }) {
  return (
    <Badge color={colorCriticidad(nivel)} variant="light">
      {nivel}
    </Badge>
  )
}
