import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconLock, IconLockOpen, IconPencil } from '@tabler/icons-react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatearFecha, formatearFechaHora } from '../../../shared/formato.ts'
import { usePuede } from '../../auth/use-puede.ts'
import { useActivo, useDarDeBajaActivo } from '../api/activos.ts'
import { ActivoFormModal } from '../activos/ActivoFormModal.tsx'
import { BadgeCriticidad } from '../componentes/BadgeCriticidad.tsx'
import { BitacoraTimeline } from './BitacoraTimeline.tsx'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text>{valor}</Text>
    </div>
  )
}

export function ActivoFichaPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: activo, isPending, error } = useActivo(id)
  const darDeBaja = useDarDeBajaActivo()
  const puedeEditar = usePuede(['admin', 'analista'])
  const puedeDarDeBaja = usePuede(['admin'])
  const [editando, edicion] = useDisclosure()

  const volver = (
    <Breadcrumbs>
      <Anchor component={Link} to="/activos">
        Inventario
      </Anchor>
      <Text>{activo?.codigo ?? `#${id}`}</Text>
    </Breadcrumbs>
  )

  if (isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }

  if (error || !activo) {
    return (
      <Stack gap="md">
        {volver}
        <Alert color="orange" title="Activo no disponible" maw={560}>
          {error?.message ?? 'El activo no existe o fue dado de baja.'}
        </Alert>
      </Stack>
    )
  }

  const confirmarBaja = () =>
    modals.openConfirmModal({
      title: `Dar de baja ${activo.codigo}`,
      children: (
        <Text size="sm">
          El activo dejará de aparecer en el inventario, pero su historial se conserva. Esta
          acción no se puede deshacer desde la aplicación.
        </Text>
      ),
      labels: { confirm: 'Dar de baja', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        darDeBaja.mutate(activo.id, {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              title: 'Activo dado de baja',
              message: `${activo.codigo} · ${activo.nombre}`,
            })
            navigate('/activos')
          },
          onError: (e) =>
            notifications.show({ color: 'red', title: 'No se pudo dar de baja', message: e.message }),
        }),
    })

  return (
    <Stack gap="lg">
      {volver}

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>
            {activo.codigo} · {activo.nombre}
          </Title>
          <Group gap="xs" mt={6}>
            <Badge variant="outline">{activo.categoria.nombre}</Badge>
            <BadgeCriticidad nivel={activo.criticidad.nivel} />
            {activo.cifrado ? (
              <Badge color="green" variant="light" leftSection={<IconLock size={12} />}>
                Cifrado
              </Badge>
            ) : (
              <Badge color="red" variant="light" leftSection={<IconLockOpen size={12} />}>
                Sin cifrar
              </Badge>
            )}
          </Group>
        </div>
        <Group gap="sm">
          {puedeEditar && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Editar
            </Button>
          )}
          {puedeDarDeBaja && (
            <Button
              variant="light"
              color="red"
              leftSection={<IconArchive size={16} />}
              onClick={confirmarBaja}
              loading={darDeBaja.isPending}
            >
              Dar de baja
            </Button>
          )}
        </Group>
      </Group>

      <Card withBorder padding="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          <Dato etiqueta="Sistemas" valor={activo.sistemas} />
          <Dato etiqueta="Custodio" valor={activo.custodio} />
          <Dato etiqueta="Ubicación" valor={activo.ubicacion} />
          <Dato etiqueta="Última revisión" valor={formatearFecha(activo.ultimaRevision)} />
          <Dato etiqueta="Registrado" valor={formatearFechaHora(activo.createdAt)} />
          <Dato etiqueta="Última modificación" valor={formatearFechaHora(activo.updatedAt)} />
        </SimpleGrid>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="md">
          Bitácora de cambios
        </Title>
        <BitacoraTimeline activoId={activo.id} />
      </Card>

      <ActivoFormModal opened={editando} onClose={edicion.close} activo={activo} />
    </Stack>
  )
}
