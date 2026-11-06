import { Alert, Loader, Table } from '@mantine/core'
import { formatearFechaHora } from '../../shared/formato.ts'
import { useHistorial } from './api.ts'
import { nombreCampo, valorLegible } from './textos.ts'

/** Historial de una solicitud (lo escribe el sistema con cada cambio): ficha y Bitácora. */
export function HistorialSolicitud({ id }: { id: number }) {
  const historial = useHistorial(id)
  if (historial.isPending) return <Loader size="sm" />
  if (historial.error) return <Alert color="red">{historial.error.message}</Alert>
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table verticalSpacing="xs" fz="sm" striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha</Table.Th>
            <Table.Th>Usuario</Table.Th>
            <Table.Th>Campo</Table.Th>
            <Table.Th>Antes</Table.Th>
            <Table.Th>Después</Table.Th>
            <Table.Th>Motivo</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {historial.data.map((h) => (
            <Table.Tr key={h.id}>
              <Table.Td>{formatearFechaHora(h.fecha)}</Table.Td>
              <Table.Td>{h.usuario}</Table.Td>
              <Table.Td fw={500}>{nombreCampo(h.campo)}</Table.Td>
              <Table.Td c="dimmed" maw={220}>
                {h.campo === 'CREACION' ? '—' : valorLegible(h.campo, h.valorAnterior)}
              </Table.Td>
              <Table.Td maw={220}>{valorLegible(h.campo, h.valorNuevo)}</Table.Td>
              <Table.Td maw={240}>{h.motivo ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
