import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconCircleCheck, IconRefresh } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import {
  useEstadoSincronizacion,
  useSincronizar,
  type ResultadoSincronizacion,
} from './api/sincronizacion.ts'
import {
  COLOR_RESULTADO,
  ETIQUETA_RESULTADO,
  puedeSincronizar,
  resumenSincronizacion,
  textoUltimaSincronizacion,
} from './resumen.ts'

/**
 * Botón "Sincronizar con GLPI" del inventario, con la fecha de la última
 * sincronización y el resumen de resultados. La sincronización corre en el
 * servidor; aquí solo se pide y se muestra lo ocurrido.
 */
export function SincronizarGlpi() {
  const puedeOperar = usePuedeOperar()
  const puedeAdministrar = usePuedeAdministrar()
  const estado = useEstadoSincronizacion()
  const sincronizar = useSincronizar()
  const [resultado, setResultado] = useState<ResultadoSincronizacion | null>(null)
  const [completa, setCompleta] = useState(false)

  const lanzar = () =>
    sincronizar.mutate(completa, {
      onSuccess: (datos) => {
        setResultado(datos)
        setCompleta(false)
      },
      onError: (e) =>
        notifications.show({
          color: 'red',
          title: 'No se pudo sincronizar con GLPI',
          message: e.message,
        }),
    })

  const texto = textoUltimaSincronizacion(estado.data)
  const resumen = resultado ? resumenSincronizacion(resultado) : null

  return (
    <>
      <Stack gap={4} align="flex-end">
        {/* El auditor ve cuándo se sincronizó, pero no el botón. */}
        {puedeOperar && (
          <Button
            variant="default"
            leftSection={<IconRefresh size={18} />}
            onClick={lanzar}
            loading={sincronizar.isPending}
            // Sin doble clic ni dos ejecuciones a la vez (el servidor también lo impide).
            disabled={!puedeSincronizar(estado.data)}
          >
            {sincronizar.isPending ? 'Sincronizando…' : 'Sincronizar con GLPI'}
          </Button>
        )}
        {texto && (
          <Text size="xs" c="dimmed">
            {texto}
          </Text>
        )}
        {puedeAdministrar && (
          <Checkbox
            size="xs"
            label="Comprobación completa (detecta equipos eliminados en GLPI)"
            checked={completa}
            onChange={(e) => setCompleta(e.currentTarget.checked)}
            disabled={sincronizar.isPending}
          />
        )}
      </Stack>

      <Modal
        opened={resultado !== null}
        onClose={() => setResultado(null)}
        title="Resultado de la sincronización con GLPI"
        size="lg"
      >
        {resultado && resumen && (
          <Stack gap="md">
            <Alert
              color={resumen.color}
              icon={resumen.color === 'green' ? <IconCircleCheck /> : <IconAlertTriangle />}
              title={resumen.titulo}
            >
              <Text size="sm">
                {resultado.modo === 'COMPLETA'
                  ? 'Comprobación completa del inventario.'
                  : 'Se consultó lo modificado en GLPI desde la última sincronización.'}
              </Text>
              {resumen.lineas.length > 0 && (
                <List size="sm" mt="xs">
                  {resumen.lineas.map((linea) => (
                    <List.Item key={linea}>{linea}</List.Item>
                  ))}
                </List>
              )}
            </Alert>

            {resultado.errores.length > 0 && (
              <Alert color="red" title="Errores" icon={<IconAlertTriangle />}>
                <List size="sm">
                  {resultado.errores.map((error) => (
                    <List.Item key={error}>{error}</List.Item>
                  ))}
                </List>
              </Alert>
            )}

            {resultado.cambios.length > 0 && (
              <ScrollArea.Autosize mah={320}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Activo</Table.Th>
                      <Table.Th>Resultado</Table.Th>
                      <Table.Th>Campos</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {resultado.cambios.map((cambio) => (
                      <Table.Tr key={cambio.referencia}>
                        <Table.Td>
                          {cambio.activoId ? (
                            <Anchor
                              component={Link}
                              to={`/activos/${cambio.activoId}`}
                              size="sm"
                              onClick={() => setResultado(null)}
                            >
                              {cambio.codigo}
                            </Anchor>
                          ) : (
                            <Text size="sm">{cambio.codigo}</Text>
                          )}
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {cambio.nombre}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={COLOR_RESULTADO[cambio.resultado]} variant="light">
                            {ETIQUETA_RESULTADO[cambio.resultado]}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c={cambio.error ? 'red' : 'dimmed'}>
                            {cambio.error ?? (cambio.campos.join(', ') || '—')}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}

            <Group justify="flex-end">
              <Button onClick={() => setResultado(null)}>Cerrar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
