import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Card,
  Center,
  Code,
  CopyButton,
  Group,
  Loader,
  Stack,
  Stepper,
  Text,
  Title,
  Tooltip,
  ActionIcon,
} from '@mantine/core'
import { IconCheck, IconCopy, IconLock, IconX } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuede } from '../auth/use-puede.ts'
import { useRespaldo, type Respaldo } from './api/respaldos.ts'
import { BadgeEtapa } from './componentes/BadgeEtapa.tsx'
import { FormEjecucion } from './componentes/FormEjecucion.tsx'
import { FormPrueba } from './componentes/FormPrueba.tsx'
import { estadoPasos, pasoActivo, type EstadoPaso } from './etapas.ts'

/** Color e icono del paso según su estado (los fallidos en rojo con ✗). */
function estiloPaso(estado: EstadoPaso) {
  if (estado === 'fallido') return { color: 'red', completedIcon: <IconX size={18} /> }
  if (estado === 'bloqueado') return { icon: <IconLock size={16} /> }
  return {}
}

/** Muestra la evidencia: enlace si es una URL, ruta copiable si es una ruta de red. */
function Evidencia({ ruta }: { ruta: string }) {
  if (/^https?:\/\//i.test(ruta)) {
    return (
      <Anchor href={ruta} target="_blank" rel="noopener noreferrer" size="sm">
        {ruta}
      </Anchor>
    )
  }
  return (
    <Group gap={4} wrap="nowrap">
      <Code>{ruta}</Code>
      <CopyButton value={ruta}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copiada' : 'Copiar ruta'}>
            <ActionIcon variant="subtle" size="sm" onClick={copy}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  )
}

function DetalleEjecucion({ respaldo }: { respaldo: Respaldo }) {
  return (
    <Stack gap={4} mt="xs">
      <Group gap="xs">
        <Badge color={respaldo.estadoEjecucion === 'EXITOSA' ? 'green' : 'red'} variant="light">
          {respaldo.estadoEjecucion === 'EXITOSA' ? 'Exitosa' : 'Fallida'}
        </Badge>
        <Text size="sm" c="dimmed">
          {formatearFechaHora(respaldo.fechaEjecucion)}
        </Text>
      </Group>
      {respaldo.rutaEvidencia && <Evidencia ruta={respaldo.rutaEvidencia} />}
    </Stack>
  )
}

function DetallePrueba({ respaldo }: { respaldo: Respaldo }) {
  return (
    <Stack gap={4} mt="xs">
      <Group gap="xs">
        <Badge color={respaldo.estadoPrueba === 'APROBADA' ? 'green' : 'orange'} variant="light">
          {respaldo.estadoPrueba === 'APROBADA' ? 'Aprobada' : 'Fallida'}
        </Badge>
        <Text size="sm" c="dimmed">
          {formatearFechaHora(respaldo.fechaPrueba)}
        </Text>
      </Group>
      <Text size="sm">{respaldo.resultadoPrueba}</Text>
    </Stack>
  )
}

export function RespaldoPage() {
  const id = Number(useParams().id)
  const { data: respaldo, isPending, error } = useRespaldo(id)
  const puedeRegistrar = usePuede(['admin', 'analista'])

  const migas = (
    <Breadcrumbs>
      <Anchor component={Link} to="/respaldos">
        Respaldos
      </Anchor>
      <Text>#{id}</Text>
    </Breadcrumbs>
  )

  if (isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }
  if (error || !respaldo) {
    return (
      <Stack gap="md">
        {migas}
        <Alert color="orange" title="Respaldo no disponible" maw={560}>
          {error?.message ?? 'El respaldo no existe.'}
        </Alert>
      </Stack>
    )
  }

  const [, ejecucion, prueba] = estadoPasos(respaldo)

  return (
    <Stack gap="lg">
      {migas}
      <div>
        <Group gap="sm">
          <Title order={2}>Respaldo #{respaldo.id}</Title>
          <BadgeEtapa etapa={respaldo.etapa} />
        </Group>
        <Text c="dimmed" size="sm" mt={4}>
          Activo:{' '}
          <Anchor component={Link} to={`/activos/${respaldo.activoId}`}>
            {respaldo.activo.codigo} · {respaldo.activo.nombre}
          </Anchor>
        </Text>
      </div>

      <Card withBorder padding="lg">
        <Stepper
          active={pasoActivo(estadoPasos(respaldo))}
          orientation="vertical"
          allowNextStepsSelect={false}
        >
          <Stepper.Step
            label="Capa 1 · Alcance"
            description={`Definido el ${formatearFechaHora(respaldo.createdAt)}`}
          >
            {null}
          </Stepper.Step>
          <Stepper.Step label="Capa 2 · Ejecución" {...estiloPaso(ejecucion)}>
            {null}
          </Stepper.Step>
          <Stepper.Step label="Capa 3 · Restauración / prueba" {...estiloPaso(prueba)}>
            {null}
          </Stepper.Step>
        </Stepper>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4}>Capa 1 · Alcance</Title>
        <Text mt="xs">{respaldo.alcanceDetalle}</Text>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4}>Capa 2 · Ejecución</Title>
        {ejecucion === 'pendiente' ? (
          puedeRegistrar ? (
            <FormEjecucion respaldoId={respaldo.id} />
          ) : (
            <Text c="dimmed" size="sm" mt="xs">
              Pendiente de registrar.
            </Text>
          )
        ) : (
          <DetalleEjecucion respaldo={respaldo} />
        )}
      </Card>

      <Card withBorder padding="lg">
        <Title order={4}>Capa 3 · Restauración / prueba</Title>
        {prueba === 'bloqueado' && (
          <Text c="dimmed" size="sm" mt="xs">
            {ejecucion === 'fallido'
              ? 'La ejecución falló: este respaldo no se puede probar. Registra un nuevo respaldo.'
              : 'Disponible cuando la ejecución se registre como exitosa.'}
          </Text>
        )}
        {prueba === 'pendiente' &&
          (puedeRegistrar ? (
            <FormPrueba respaldoId={respaldo.id} fechaEjecucion={respaldo.fechaEjecucion!} />
          ) : (
            <Text c="dimmed" size="sm" mt="xs">
              Pendiente de registrar.
            </Text>
          ))}
        {(prueba === 'completado' || prueba === 'fallido') && (
          <DetallePrueba respaldo={respaldo} />
        )}
      </Card>
    </Stack>
  )
}
