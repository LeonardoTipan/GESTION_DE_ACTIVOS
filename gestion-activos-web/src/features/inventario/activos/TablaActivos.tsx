import { Anchor, Badge, Table, Text, Tooltip } from '@mantine/core'
import { IconLock, IconLockOpen } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { formatearFecha } from '../../../shared/formato.ts'
import type { Activo } from '../api/activos.ts'
import { BadgeCriticidad } from '../componentes/BadgeCriticidad.tsx'

/** "Laptop · ASUSTeK · ROG Zephyrus": solo las partes que el activo tenga. */
function descripcionEquipo(activo: Activo): string {
  return [activo.tipo, activo.fabricante, activo.modelo]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(' · ')
}

export function TablaActivos({ activos }: { activos: Activo[] }) {
  const navigate = useNavigate()

  return (
    <Table.ScrollContainer minWidth={1180}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Nombre y equipo</Table.Th>
            <Table.Th>N.º de serie</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Categoría</Table.Th>
            <Table.Th>Criticidad</Table.Th>
            <Table.Th>Cifrado</Table.Th>
            <Table.Th>Custodio</Table.Th>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th>Última revisión</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {activos.map((activo) => {
            const equipo = descripcionEquipo(activo)
            return (
              <Table.Tr
                key={activo.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/activos/${activo.id}`)}
              >
                <Table.Td>
                  {/* Enlace real: se puede abrir en otra pestaña y navegar con teclado. */}
                  <Anchor
                    component={Link}
                    to={`/activos/${activo.id}`}
                    fw={600}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activo.codigo}
                  </Anchor>
                </Table.Td>
                <Table.Td maw={300}>
                  <Text size="sm" lineClamp={2}>
                    {activo.nombre}
                  </Text>
                  {/* Tipo, fabricante y modelo en una segunda línea: no ocupan columnas. */}
                  {equipo && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {equipo}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {activo.numeroSerie?.trim() || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {activo.estado?.trim() ? (
                    <Badge variant="default">{activo.estado}</Badge>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>{activo.categoria.nombre}</Table.Td>
                <Table.Td>
                  <BadgeCriticidad nivel={activo.criticidad.nivel} />
                </Table.Td>
                <Table.Td>
                  {activo.cifrado ? (
                    <Tooltip label="Cifrado">
                      <IconLock size={18} color="var(--mantine-color-green-7)" />
                    </Tooltip>
                  ) : (
                    <Tooltip label="Sin cifrar">
                      <IconLockOpen size={18} color="var(--mantine-color-red-7)" />
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td>{activo.custodio}</Table.Td>
                <Table.Td>{activo.ubicacion}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatearFecha(activo.ultimaRevision)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
