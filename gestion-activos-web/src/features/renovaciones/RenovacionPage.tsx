import { Alert, Anchor, Breadcrumbs, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Stepper, Tabs, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCalendarEvent, IconChecklist, IconPencil } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { formatearFecha, formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, ControlRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { useAnulacionRenovacion, useRenovacion, type Renovacion } from './api.ts'
import { BadgeEstado, BadgeVigencia } from './componentes.tsx'
import { Ejecucion } from './Ejecucion.tsx'
import { PlanificacionModal } from './PlanificacionModal.tsx'
import { INFO_ESTADO, INFO_TIPO } from './textos.ts'

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text component="div" size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {children}
      </Text>
    </div>
  )
}

/** Nombres de los campos, para las trazas (sin nombres internos). */
const ETIQUETAS: Record<string, string> = {
  activoId: 'Sistema (activo)',
  tipo: 'Tipo de renovación',
  responsable: 'Responsable',
  fechaPlanificada: 'Fecha planificada',
  fechaCaducidadActual: 'Fecha de caducidad actual',
  sinCaducidadActual: 'Sin caducidad (actual)',
  estado: 'Estado',
  fechaRenovacion: 'Fecha real de renovación',
  nuevaFechaCaducidad: 'Nueva fecha de caducidad',
  nuevaSinCaducidad: 'Sin caducidad (nueva)',
  evidencia: 'Verificable',
  repositorioVerificable: 'Repositorio verificable',
  descripcion: 'Descripción',
  observacion: 'Observación',
  cerradaPor: 'Cerrada por',
  renovacionAnteriorId: 'Renovación anterior',
}

/** Fase 1 · Planificación. */
function Planificacion({ r }: { r: Renovacion }) {
  const puedeOperar = usePuedeOperar()
  const categorias = useCategorias()
  const [editando, edicion] = useDisclosure()
  const clase = categorias.data?.find((c) => c.id === r.activo.categoriaId)?.claseMantenimiento ?? null
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>1 · Planificación</Title>
        {puedeOperar && !r.anuladoEn && r.estado !== 'CERRADO' && (
          <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
            Corregir planificación
          </Button>
        )}
      </Group>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Dato etiqueta="Sistema">
            <Anchor component={Link} to={`/activos/${r.activoId}`} size="sm">
              {r.activo.codigo} · {r.activo.nombre}
            </Anchor>
            <Group gap={6} mt={4}>
              <Text size="xs" c="dimmed">
                {r.activo.categoria}
              </Text>
              <BadgeClase clase={clase} size="xs" />
            </Group>
          </Dato>
          <Dato etiqueta="Tipo de renovación">{INFO_TIPO[r.tipo]}</Dato>
          <Dato etiqueta="Responsable">{r.responsable}</Dato>
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Dato etiqueta="Fecha planificada">{formatearFecha(r.fechaPlanificada)}</Dato>
          <Dato etiqueta="Fecha de caducidad actual">{r.sinCaducidadActual ? 'Sin caducidad conocida o aplicable' : formatearFecha(r.fechaCaducidadActual)}</Dato>
          <Dato etiqueta="Vigencia del elemento hoy">
            <BadgeVigencia r={r} />
          </Dato>
        </SimpleGrid>
        {r.observacion && <Dato etiqueta="Observación">{r.observacion}</Dato>}
        {(r.renovacionAnterior || r.sustituidaPor) && (
          <Alert color="gray" variant="light" title="Renovaciones del mismo elemento">
            {r.renovacionAnterior && (
              <Text size="sm">
                Anterior:{' '}
                <Anchor component={Link} to={`/renovaciones/${r.renovacionAnterior.id}`}>
                  #{r.renovacionAnterior.id}
                </Anchor>{' '}
                · renovada el {formatearFecha(r.renovacionAnterior.fechaRenovacion)}, vigente hasta {formatearFecha(r.renovacionAnterior.nuevaFechaCaducidad)}.
              </Text>
            )}
            {r.sustituidaPor && (
              <Text size="sm">
                Posterior:{' '}
                <Anchor component={Link} to={`/renovaciones/${r.sustituidaPor}`}>
                  #{r.sustituidaPor}
                </Anchor>{' '}
                · esta renovación se conserva como historia.
              </Text>
            )}
          </Alert>
        )}
      </Stack>
      <PlanificacionModal opened={editando} onClose={edicion.close} renovacion={r} />
    </Card>
  )
}

export function RenovacionPage() {
  const id = Number(useParams().id)
  const { data: r, isPending, error } = useRenovacion(id)
  const anulacion = useAnulacionRenovacion()
  const [params, setParams] = useSearchParams()

  const migas = (
    <Breadcrumbs>
      <Anchor component={Link} to="/renovaciones">
        Renovaciones
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
  if (error || !r) {
    return (
      <Stack gap="md">
        {migas}
        <Alert color="orange" title="Renovación no disponible" maw={560}>
          {error?.message ?? 'La renovación no existe.'}
        </Alert>
      </Stack>
    )
  }

  const fase = params.get('fase') === 'planificacion' || params.get('fase') === 'ejecucion' ? params.get('fase')! : r.estado === 'ABIERTO' ? 'planificacion' : 'ejecucion'
  const cerrada = r.estado === 'CERRADO'

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>
              {INFO_TIPO[r.tipo]} · {r.activo.codigo}
            </Title>
            <BadgeEstado estado={r.estado} />
            <BadgeVigencia r={r} />
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {r.activo.nombre} · responsable {r.responsable}
          </Text>
        </div>
        <ControlRegistro
          registro={r}
          entidad="RENOVACION"
          registroId={r.id}
          nombre={`la renovación #${r.id}`}
          etiquetas={ETIQUETAS}
          enviando={anulacion.isPending}
          onAnulacion={(modo, motivo, listo) =>
            anulacion.mutate(
              { id: r.id, modo, motivo },
              {
                onSuccess: () => {
                  notifications.show({ color: 'green', title: modo === 'anular' ? 'Registro anulado' : 'Anulación revertida', message: 'Se conserva para auditoría.' })
                  listo()
                },
                onError: (e) => notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
              },
            )
          }
        />
      </Group>
      <AvisoAnulado registro={r} />

      {/* Solo dos fases sobre el mismo registro: Planificación y Ejecución y cierre. */}
      <Card withBorder padding="lg">
        <Stepper active={cerrada ? 2 : 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Planificación" description={`Planificada para el ${formatearFecha(r.fechaPlanificada)}`}>
            {null}
          </Stepper.Step>
          <Stepper.Step label="Ejecución y cierre" description={cerrada ? `Renovada el ${formatearFecha(r.fechaRenovacion)}` : INFO_ESTADO[r.estado].etiqueta}>
            {null}
          </Stepper.Step>
        </Stepper>
      </Card>

      <Tabs
        value={fase}
        onChange={(f) => {
          const nuevos = new URLSearchParams(params)
          nuevos.set('fase', f ?? 'planificacion')
          setParams(nuevos, { replace: true })
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="planificacion" leftSection={<IconCalendarEvent size={16} />}>
            1 · Planificación
          </Tabs.Tab>
          <Tabs.Tab value="ejecucion" leftSection={<IconChecklist size={16} />}>
            2 · Ejecución y cierre
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="planificacion" pt="md">
          <Planificacion r={r} />
        </Tabs.Panel>
        <Tabs.Panel value="ejecucion" pt="md">
          <Ejecucion r={r} />
        </Tabs.Panel>
      </Tabs>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Dato etiqueta="Fecha de registro (automática)">{formatearFechaHora(r.createdAt)}</Dato>
        <Dato etiqueta="Última modificación">{formatearFechaHora(r.updatedAt)}</Dato>
      </SimpleGrid>
    </Stack>
  )
}
