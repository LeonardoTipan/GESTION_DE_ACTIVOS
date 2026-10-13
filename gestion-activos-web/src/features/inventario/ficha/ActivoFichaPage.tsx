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
import {
  IconArchive,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconRefresh,
} from '@tabler/icons-react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatearFecha, formatearFechaHora, SIN_DATO } from '../../../shared/formato.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../auth/use-puede.ts'
import { useActivo, useDarDeBajaActivo } from '../api/activos.ts'
import { ActivoFormModal } from '../activos/ActivoFormModal.tsx'
import { BadgeCriticidad } from '../componentes/BadgeCriticidad.tsx'
import { BadgeSituacion } from '../componentes/BadgeSituacion.tsx'
import { situacionDe } from '../componentes/situacion.ts'
import { BitacoraTimeline } from './BitacoraTimeline.tsx'

/** Un dato opcional vacío (null o "") se muestra, atenuado, como "No registrado". */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  const texto = valor?.trim()
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      {texto ? <Text>{texto}</Text> : <Text c="dimmed">{SIN_DATO}</Text>}
    </div>
  )
}

export function ActivoFichaPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: activo, isPending, error } = useActivo(id)
  const darDeBaja = useDarDeBajaActivo()
  const puedeEditar = usePuedeOperar()
  const puedeDarDeBaja = usePuedeAdministrar()
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
          {error?.message ?? 'El activo no existe.'}
        </Alert>
      </Stack>
    )
  }

  const confirmarBaja = () =>
    modals.openConfirmModal({
      title: `Dar de baja ${activo.codigo}`,
      children: (
        <Text size="sm">
          El activo pasará a No activo: ya no admitirá respaldos, mantenimientos ni
          vulnerabilidades nuevos, pero conserva su ficha, su historial y sus registros. Esta
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

  const situacion = situacionDe(activo)
  const deBaja = activo.deletedAt !== null

  return (
    <Stack gap="lg">
      {volver}

      {!situacion.activo && (
        <Alert color="gray" icon={<IconArchive />} title={`No activo · ${situacion.motivo}`}>
          Desde {formatearFechaHora(situacion.desde)}. No admite respaldos, mantenimientos ni
          vulnerabilidades nuevos. Su ficha, su historial y sus registros anteriores se conservan.
        </Alert>
      )}

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>
            {activo.codigo} · {activo.nombre}
          </Title>
          <Group gap="xs" mt={6}>
            <BadgeSituacion activo={activo} />
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
            {activo.origenGlpi && (
              <Badge color="blue" variant="light" leftSection={<IconRefresh size={12} />}>
                Sincronizado con GLPI · {activo.origenGlpi}
              </Badge>
            )}
          </Group>
        </div>
        <Group gap="sm">
          {puedeEditar && !deBaja && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Editar
            </Button>
          )}
          {puedeDarDeBaja && !deBaja && (
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
        <Title order={4} mb="md">
          Uso y responsables
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          <Dato etiqueta="Responsable" valor={activo.custodio} />
          <Dato etiqueta="Técnico asignado" valor={activo.tecnicoResponsable} />
          <Dato etiqueta="Red" valor={activo.red} />
          <Dato etiqueta="Contacto" valor={activo.contacto} />
          <Dato etiqueta="Ubicación" valor={activo.ubicacion} />
          <Dato etiqueta="Sistemas" valor={activo.sistemas} />
        </SimpleGrid>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="md">
          Datos del equipo
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          <Dato etiqueta="Nombre" valor={activo.nombre} />
          <Dato etiqueta="Código operativo" valor={activo.codigo} />
          <Dato etiqueta="Tipo" valor={activo.tipo} />
          <Dato etiqueta="Fabricante" valor={activo.fabricante} />
          <Dato etiqueta="Modelo" valor={activo.modelo} />
          <Dato etiqueta="Número de serie" valor={activo.numeroSerie} />
          <Dato etiqueta="Número de inventario" valor={activo.numeroInventario} />
          <Dato etiqueta="Dirección IP" valor={activo.direccionIp} />
          <Dato etiqueta="Estado" valor={activo.estado} />
          <Dato etiqueta="Código institucional original" valor={activo.codigoInstitucional} />
        </SimpleGrid>
        <div style={{ marginTop: 'var(--mantine-spacing-lg)' }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Comentario
          </Text>
          {/* pre-wrap: respeta los saltos de línea de las características técnicas. */}
          {activo.comentario?.trim() ? (
            <Text style={{ whiteSpace: 'pre-wrap' }}>{activo.comentario.trim()}</Text>
          ) : (
            <Text c="dimmed">{SIN_DATO}</Text>
          )}
        </div>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="md">
          Fechas
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          <Dato
            etiqueta="Fecha de alta"
            valor={activo.fechaAlta && formatearFechaHora(activo.fechaAlta)}
          />
          <Dato
            etiqueta="Fecha de compra"
            valor={activo.fechaCompra && formatearFecha(activo.fechaCompra)}
          />
          <Dato etiqueta="Última revisión" valor={formatearFecha(activo.ultimaRevision)} />
          <Dato etiqueta="Registrado en la aplicación" valor={formatearFechaHora(activo.createdAt)} />
          <Dato etiqueta="Última actualización" valor={formatearFechaHora(activo.updatedAt)} />
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
