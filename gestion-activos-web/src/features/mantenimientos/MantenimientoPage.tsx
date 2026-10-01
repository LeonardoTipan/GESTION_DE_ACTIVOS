import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconCheck, IconPlayerPlay, IconX } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useMantenimiento, type Mantenimiento } from './api/mantenimientos.ts'
import { BadgeEstadoEquipo, BadgeFase, BadgeTipo, BadgeVencido } from './componentes/Badges.tsx'
import { CancelarModal } from './componentes/CancelarModal.tsx'
import { FinalizarModal } from './componentes/FinalizarModal.tsx'
import { IniciarModal } from './componentes/IniciarModal.tsx'
import { accionesPermitidas, estadoPasos, pasoActivo, type EstadoPaso } from './fases.ts'

/** Un paso cancelado se pinta en rojo con ✗ y cambia su etiqueta. */
function paso(estado: EstadoPaso, etiqueta: string, descripcion: string) {
  if (estado === 'cancelado') {
    return {
      label: 'Cancelado',
      description: descripcion,
      color: 'red',
      completedIcon: <IconX size={18} />,
    }
  }
  return { label: etiqueta, description: estado === 'completado' ? descripcion : undefined }
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text component="div" size="sm">
        {children}
      </Text>
    </div>
  )
}

/** Botones de transición: solo los que permite la fase y solo para quien puede operar. */
function Acciones({ mantenimiento }: { mantenimiento: Mantenimiento }) {
  const [iniciando, iniciar] = useDisclosure()
  const [finalizando, finalizar] = useDisclosure()
  const [cancelando, cancelar] = useDisclosure()
  const acciones = accionesPermitidas(mantenimiento.fase)
  if (acciones.length === 0) return null

  return (
    <>
      <Group gap="sm">
        {acciones.includes('iniciar') && (
          <Button color="yellow" leftSection={<IconPlayerPlay size={16} />} onClick={iniciar.open}>
            Iniciar
          </Button>
        )}
        {acciones.includes('finalizar') && (
          <Button color="green" leftSection={<IconCheck size={16} />} onClick={finalizar.open}>
            Finalizar
          </Button>
        )}
        {acciones.includes('cancelar') && (
          <Button
            color="red"
            variant="light"
            leftSection={<IconX size={16} />}
            onClick={cancelar.open}
          >
            Cancelar
          </Button>
        )}
      </Group>
      <IniciarModal
        opened={iniciando}
        onClose={iniciar.close}
        mantenimientoId={mantenimiento.id}
      />
      <FinalizarModal
        opened={finalizando}
        onClose={finalizar.close}
        mantenimientoId={mantenimiento.id}
        fechaInicio={mantenimiento.fechaInicio}
      />
      <CancelarModal
        opened={cancelando}
        onClose={cancelar.close}
        mantenimientoId={mantenimiento.id}
      />
    </>
  )
}

export function MantenimientoPage() {
  const id = Number(useParams().id)
  const { data: m, isPending, error } = useMantenimiento(id)
  const puedeOperar = usePuedeOperar()

  const migas = (
    <Breadcrumbs>
      <Anchor component={Link} to="/mantenimientos">
        Mantenimientos
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
  if (error || !m) {
    return (
      <Stack gap="md">
        {migas}
        <Alert color="orange" title="Mantenimiento no disponible" maw={560}>
          {error?.message ?? 'El mantenimiento no existe.'}
        </Alert>
      </Stack>
    )
  }

  const pasos = estadoPasos(m)
  const [, ejecucion, cierre] = pasos
  const cancelado = m.fase === 'CANCELADO'

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>Mantenimiento #{m.id}</Title>
            <BadgeTipo tipo={m.tipo} />
            <BadgeFase fase={m.fase} />
            {m.vencido && <BadgeVencido />}
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            Activo:{' '}
            <Anchor component={Link} to={`/activos/${m.activoId}`}>
              {m.activo.codigo} · {m.activo.nombre}
            </Anchor>
          </Text>
        </div>
        {puedeOperar && <Acciones mantenimiento={m} />}
      </Group>

      {m.vencido && (
        <Alert color="red" title="Mantenimiento vencido" maw={720}>
          La fecha programada ya pasó y todavía no se ha iniciado.
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stepper active={pasoActivo(pasos)} allowNextStepsSelect={false}>
          <Stepper.Step label="Programado" description={formatearFechaHora(m.fecha)}>
            {null}
          </Stepper.Step>
          <Stepper.Step
            {...paso(
              ejecucion,
              'En ejecución',
              formatearFechaHora(ejecucion === 'cancelado' ? m.fechaFin : m.fechaInicio),
            )}
          >
            {null}
          </Stepper.Step>
          <Stepper.Step {...paso(cierre, 'Finalizado', formatearFechaHora(m.fechaFin))}>
            {null}
          </Stepper.Step>
        </Stepper>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Detalle
        </Title>
        <Stack gap="md">
          <Dato etiqueta="Actividad">{m.actividad}</Dato>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Fecha programada">{formatearFechaHora(m.fecha)}</Dato>
            <Dato etiqueta="Inicio">{formatearFechaHora(m.fechaInicio)}</Dato>
            <Dato etiqueta={cancelado ? 'Cancelado el' : 'Fin'}>
              {formatearFechaHora(m.fechaFin)}
            </Dato>
          </SimpleGrid>
          {m.fase === 'FINALIZADO' && (
            <>
              <Dato etiqueta="Estado del equipo">
                <BadgeEstadoEquipo estado={m.estadoEquipo} />
              </Dato>
              <Dato etiqueta="Resultado">{m.resultado}</Dato>
            </>
          )}
          {cancelado && (
            <Alert color="gray" title="Motivo de la cancelación">
              {m.resultado}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Registrado">{formatearFechaHora(m.createdAt)}</Dato>
            <Dato etiqueta="Última actualización">{formatearFechaHora(m.updatedAt)}</Dato>
          </SimpleGrid>
        </Stack>
      </Card>
    </Stack>
  )
}
