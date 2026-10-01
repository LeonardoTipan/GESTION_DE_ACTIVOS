import { Badge } from '@mantine/core'
import type { Etapa } from '../api/respaldos.ts'
import { INFO_ETAPA } from '../etapas.ts'

export function BadgeEtapa({ etapa }: { etapa: Etapa }) {
  const { etiqueta, color } = INFO_ETAPA[etapa]
  return (
    <Badge color={color} variant="light">
      {etiqueta}
    </Badge>
  )
}
