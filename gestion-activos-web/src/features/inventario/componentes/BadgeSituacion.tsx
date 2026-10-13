import { Badge, Tooltip } from '@mantine/core'
import { formatearFechaHora } from '../../../shared/formato.ts'
import type { Activo } from '../api/activos.ts'
import { situacionDe } from './situacion.ts'

/** "Activo" / "No activo", con el motivo y la fecha al pasar el ratón. */
export function BadgeSituacion({
  activo,
}: {
  activo: Pick<Activo, 'deletedAt' | 'inactivoDesde' | 'motivoInactivo'>
}) {
  const situacion = situacionDe(activo)
  if (situacion.activo) {
    return (
      <Badge color="green" variant="light">
        Activo
      </Badge>
    )
  }
  return (
    <Tooltip label={`${situacion.motivo} · desde ${formatearFechaHora(situacion.desde)}`}>
      <Badge color="gray" variant="filled">
        No activo
      </Badge>
    </Tooltip>
  )
}
