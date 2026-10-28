import { Alert, Anchor, Badge, Center, Loader, ScrollArea, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { Link } from 'react-router'
import { PanelTablero } from '../../shared/components/Tablero.tsx'
import { formatearFecha, hoyLocal } from '../../shared/formato.ts'
import { useCaducidades, useRenovaciones, useResumenVigencias } from './api.ts'
import { INFO_ESTADO, INFO_TIPO, textoDias } from './textos.ts'

const MAXIMO_LISTA = 20

/**
 * Los dos paneles del tablero de Planificación, con la organización de Planificación de
 * Mantenimientos: a la izquierda el calendario (aquí, las caducidades que llegan dentro del
 * umbral configurado) y a la derecha lo que espera una acción (aquí, las renovaciones
 * planificadas que aún no se iniciaron). Solo datos reales del módulo.
 */
export function PanelesPlanificacion() {
  const resumen = useResumenVigencias()
  const caducidades = useCaducidades()
  const sinIniciar = useRenovaciones({ estado: 'ABIERTO', incluirAnulados: false, page: 1, limit: MAXIMO_LISTA })
  const error = caducidades.error ?? sinIniciar.error
  if (error) return <Alert color="red">{error.message}</Alert>
  const dias = resumen.data?.diasAviso
  const hoy = hoyLocal()
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      <PanelTablero titulo={dias ? `Calendario · próximas caducidades (${dias} días)` : 'Calendario · próximas caducidades'}>
        {!caducidades.data ? (
          <Center py="md">
            <Loader size="sm" />
          </Center>
        ) : caducidades.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay caducidades previstas.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={260} type="auto">
            <Table verticalSpacing={4} fz="sm">
              <Table.Tbody>
                {caducidades.data.map((r) => {
                  const caducada = r.vigencia === 'CADUCADA'
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td c={caducada ? 'red' : undefined} fw={caducada ? 600 : undefined} w={150}>
                        {formatearFecha(r.venceEl)}
                      </Table.Td>
                      <Table.Td>
                        {r.activo.codigo} · {r.activo.nombre}
                        <Text size="xs" c="dimmed">
                          {r.activo.categoria}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="outline" color="gray" style={{ minWidth: 'max-content' }}>
                          {INFO_TIPO[r.tipo]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/renovaciones/${r.id}`} size="sm">
                          #{r.id} · {INFO_ESTADO[r.estado].etiqueta.toLowerCase()}
                        </Anchor>
                        <Text size="xs" c={caducada ? 'red' : 'dimmed'}>
                          {textoDias(r.diasRestantes)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </PanelTablero>
      <PanelTablero titulo="Planificadas sin iniciar">
        {sinIniciar.data && sinIniciar.data.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            Todas las renovaciones planificadas ya están en ejecución o cerradas.
          </Text>
        ) : (
          <Stack gap={2}>
            {sinIniciar.data?.data.map((r) => {
              const atrasada = r.fechaPlanificada.slice(0, 10) < hoy
              return (
                <Text size="sm" key={r.id}>
                  <Anchor component={Link} to={`/renovaciones/${r.id}`}>
                    #{r.id}
                  </Anchor>{' '}
                  · {r.activo.codigo} · {r.activo.nombre}{' '}
                  <Text span size="xs" c={atrasada ? 'red' : 'dimmed'}>
                    ({INFO_TIPO[r.tipo]}, planificada {formatearFecha(r.fechaPlanificada)})
                  </Text>
                </Text>
              )
            })}
            {sinIniciar.data && sinIniciar.data.meta.total > sinIniciar.data.data.length && (
              <Text size="xs" c="dimmed">
                … y {sinIniciar.data.meta.total - sinIniciar.data.data.length} más.
              </Text>
            )}
          </Stack>
        )}
      </PanelTablero>
    </SimpleGrid>
  )
}
