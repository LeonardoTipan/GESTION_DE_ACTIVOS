import { Alert, Anchor, Center, Loader, ScrollArea, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { Link } from 'react-router'
import { Cifra, PanelTablero } from '../../../shared/components/Tablero.tsx'
import { formatearDia } from '../../../shared/formato.ts'
import { usePendientesDeRemediar, useVulnerabilidades } from '../api/vulnerabilidades.ts'
import { DIAS_TABLERO, INFO_ESTADO, INFO_NIVEL } from '../riesgo.ts'
import { BadgeNivel } from './Badges.tsx'

/**
 * Tablero de la fase de Detección, con la organización de Planificación de Mantenimientos:
 * tres cifras y dos paneles. Todo sale de los datos reales de vulnerabilidades (no de
 * mantenimientos): plazos de remediación, pendientes sin plazo y vencidas.
 */
export function TableroDeteccion() {
  const pendientes = usePendientesDeRemediar()
  const vencidas = useVulnerabilidades({ vencidas: true, incluirAnulados: false, page: 1, limit: 1 })
  const error = pendientes.error ?? vencidas.error
  if (error) return <Alert color="red">{error.message}</Alert>
  const proximos = pendientes.data?.proximos
  const sinPlazo = pendientes.data?.sinPlazo
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
        <Cifra titulo={`Plazos en ${DIAS_TABLERO} días`} valor={proximos?.length} pista="Pendientes con fecha límite próxima o vencida" />
        <Cifra titulo="Pendientes sin plazo" valor={sinPlazo?.length} color="orange" pista="Abiertas o en progreso, sin fecha límite" />
        <Cifra titulo="Plazo vencido" valor={vencidas.data?.meta.total} color="red" pista="Fecha límite ya pasada" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <PanelTablero titulo={`Calendario · plazos de los próximos ${DIAS_TABLERO} días`}>
          {!proximos ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : proximos.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay plazos de remediación previstos.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={260} type="auto">
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {proximos.map(({ v, vencido }) => {
                    return (
                      <Table.Tr key={v.id}>
                        <Table.Td c={vencido ? 'red' : undefined} fw={vencido ? 600 : undefined} w={150}>
                          {formatearDia(v.fechaLimite!)}
                        </Table.Td>
                        <Table.Td>
                          {v.activo.codigo} · {v.activo.nombre}
                          <Text size="xs" c="dimmed">
                            {v.activo.categoria}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <BadgeNivel nivel={v.nivelRiesgo} />
                        </Table.Td>
                        <Table.Td>
                          <Anchor component={Link} to={`/vulnerabilidades/${v.id}`} size="sm">
                            #{v.id} · {INFO_ESTADO[v.estado].etiqueta.toLowerCase()}
                          </Anchor>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
        </PanelTablero>
        <PanelTablero titulo="Pendientes sin plazo de remediación">
          {sinPlazo && sinPlazo.length === 0 ? (
            <Text size="sm" c="dimmed">
              Todas las vulnerabilidades pendientes tienen un plazo de remediación.
            </Text>
          ) : (
            <Stack gap={2}>
              {sinPlazo?.slice(0, 20).map((v) => (
                <Text size="sm" key={v.id} lineClamp={1}>
                  <Anchor component={Link} to={`/vulnerabilidades/${v.id}`}>
                    #{v.id}
                  </Anchor>{' '}
                  · {v.activo.codigo} · {v.descripcion}{' '}
                  <Text span size="xs" c="dimmed">
                    ({INFO_NIVEL[v.nivelRiesgo].etiqueta})
                  </Text>
                </Text>
              ))}
              {sinPlazo && sinPlazo.length > 20 && (
                <Text size="xs" c="dimmed">
                  … y {sinPlazo.length - 20} más.
                </Text>
              )}
            </Stack>
          )}
        </PanelTablero>
      </SimpleGrid>
      {pendientes.data?.truncado && (
        <Text size="xs" c="dimmed">
          Cifras calculadas sobre las primeras {pendientes.data.leidas} pendientes de {pendientes.data.total}.
        </Text>
      )}
    </Stack>
  )
}
