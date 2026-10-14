import { Badge, Text, Tooltip } from '@mantine/core'
import { formatearFechaHora, SIN_DATO } from '../../../shared/formato.ts'
import type { Activo } from '../api/activos.ts'
import { estadoDe } from './estado.ts'

/** Estado del activo; si está dado de baja, con el motivo y la fecha al pasar el ratón. */
export function BadgeEstado({
  activo,
}: {
  activo: Pick<Activo, 'estado' | 'deletedAt' | 'inactivoDesde' | 'motivoInactivo'>
}) {
  const estado = estadoDe(activo)
  if (estado.baja) {
    return (
      <Tooltip label={`${estado.motivo} · desde ${formatearFechaHora(estado.desde)}`}>
        <Badge color="gray" variant="filled">
          {estado.etiqueta}
        </Badge>
      </Tooltip>
    )
  }
  if (!estado.etiqueta) {
    return (
      <Text size="xs" c="dimmed">
        {SIN_DATO}
      </Text>
    )
  }
  return <Badge variant="default">{estado.etiqueta}</Badge>
}
