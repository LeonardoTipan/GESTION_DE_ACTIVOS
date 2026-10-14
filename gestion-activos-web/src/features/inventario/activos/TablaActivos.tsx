import { Anchor, Table, Text, Tooltip } from '@mantine/core'
import { IconLock, IconLockOpen } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { formatearFecha, SIN_DATO } from '../../../shared/formato.ts'
import type { Activo } from '../api/activos.ts'
import { BadgeCriticidad } from '../componentes/BadgeCriticidad.tsx'
import { BadgeEstado } from '../componentes/BadgeEstado.tsx'
import { estadoDe } from '../componentes/estado.ts'

/** "Laptop · ASUSTeK · ROG Zephyrus": solo las partes que el activo tenga. */
function descripcionEquipo(activo: Activo): string {
  return [activo.tipo, activo.fabricante, activo.modelo]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(' · ')
}

/** Dato opcional vacío: el mismo texto atenuado en toda la tabla. */
function Vacio() {
  return (
    <Text size="xs" c="dimmed">
      {SIN_DATO}
    </Text>
  )
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
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th>Última revisión</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {activos.map((activo) => {
            const equipo = descripcionEquipo(activo)
            const inventario = activo.numeroInventario?.trim()
            return (
              <Table.Tr
                key={activo.id}
                // Los dados de baja se ven atenuados, pero siguen consultables.
                style={{ cursor: 'pointer', opacity: estadoDe(activo).baja ? 0.65 : 1 }}
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
                  {/* El n.º de inventario de origen, solo cuando existe: no es el código. */}
                  {inventario && (
                    <Text size="xs" c="dimmed">
                      Inv. {inventario}
                    </Text>
                  )}
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
                  {activo.numeroSerie?.trim() ? (
                    <Text size="sm" ff="monospace">
                      {activo.numeroSerie}
                    </Text>
                  ) : (
                    <Vacio />
                  )}
                </Table.Td>
                <Table.Td>
                  <BadgeEstado activo={activo} />
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
