import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Center,
  Group,
  Indicator,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Switch,
  Text,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconBell, IconCheck } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import {
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificaciones,
  useResumenNotificaciones,
} from './api/sincronizacion.ts'
import { ASPECTO_NOTIFICACION, mensajeDeAviso } from './resumen.ts'

/**
 * Campana de la cabecera: avisos de lo que cambió al sincronizar con GLPI
 * (altas, modificaciones, cambios de estado, bajas detectadas y errores).
 */
export function CampanaNotificaciones() {
  const [abierta, { toggle, close }] = useDisclosure()
  const [soloNoLeidas, setSoloNoLeidas] = useState(true)
  const puedeMarcar = usePuedeOperar()
  const resumen = useResumenNotificaciones()
  const lista = useNotificaciones(soloNoLeidas, { enabled: abierta })
  const marcar = useMarcarLeida()
  const marcarTodas = useMarcarTodasLeidas()

  const noLeidas = resumen.data?.noLeidas ?? 0

  return (
    <Popover opened={abierta} onChange={(o) => !o && close()} position="bottom-end" width={420} shadow="md">
      <Popover.Target>
        <Indicator label={noLeidas > 99 ? '99+' : noLeidas} size={16} disabled={noLeidas === 0} color="red">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={toggle}
            aria-label={`Notificaciones (${noLeidas} sin leer)`}
          >
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Avisos: GLPI y módulos</Text>
          <Switch
            size="xs"
            label="Solo sin leer"
            checked={soloNoLeidas}
            onChange={(e) => setSoloNoLeidas(e.currentTarget.checked)}
          />
        </Group>

        {lista.isPending && (
          <Center py="md">
            <Loader size="sm" />
          </Center>
        )}
        {lista.error && (
          <Text size="sm" c="red">
            {lista.error.message}
          </Text>
        )}
        {lista.data && lista.data.data.length === 0 && (
          <Text size="sm" c="dimmed" py="md" ta="center">
            {soloNoLeidas ? 'No hay avisos pendientes.' : 'Todavía no hay avisos.'}
          </Text>
        )}
        {lista.data && lista.data.data.length > 0 && (
          <ScrollArea.Autosize mah={380}>
            <Stack gap="xs">
              {lista.data.data.map((aviso) => {
                const aspecto = ASPECTO_NOTIFICACION[aviso.tipo]
                const mensaje = mensajeDeAviso(aviso)
                return (
                  <Group key={aviso.id} gap="xs" align="flex-start" wrap="nowrap">
                    <div style={{ flex: 1, opacity: aviso.leida ? 0.6 : 1 }}>
                      <Group gap={6}>
                        <Badge size="xs" color={aspecto.color} variant="light">
                          {aspecto.etiqueta}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatearFechaHora(aviso.fecha)}
                        </Text>
                      </Group>
                      {aviso.activoId ? (
                        <Anchor component={Link} to={`/activos/${aviso.activoId}`} size="sm" onClick={close}>
                          {aviso.titulo}
                        </Anchor>
                      ) : (
                        <Text size="sm">{aviso.titulo}</Text>
                      )}
                      {mensaje && (
                        <Text size="xs" c="dimmed" lineClamp={3}>
                          {mensaje}
                        </Text>
                      )}
                    </div>
                    {/* El auditor consulta los avisos, pero no los marca. */}
                    {puedeMarcar && !aviso.leida && (
                      <ActionIcon
                        variant="subtle"
                        color="green"
                        aria-label="Marcar como leído"
                        onClick={() => marcar.mutate(aviso.id)}
                        loading={marcar.isPending && marcar.variables === aviso.id}
                      >
                        <IconCheck size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                )
              })}
              {lista.data.meta.total > lista.data.data.length && (
                <Text size="xs" c="dimmed" ta="center">
                  Se muestran los {lista.data.data.length} más recientes de {lista.data.meta.total}.
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {puedeMarcar && noLeidas > 0 && (
          <Button
            mt="sm"
            fullWidth
            variant="light"
            size="xs"
            onClick={() => marcarTodas.mutate()}
            loading={marcarTodas.isPending}
          >
            Marcar todos como leídos
          </Button>
        )}
      </Popover.Dropdown>
    </Popover>
  )
}
