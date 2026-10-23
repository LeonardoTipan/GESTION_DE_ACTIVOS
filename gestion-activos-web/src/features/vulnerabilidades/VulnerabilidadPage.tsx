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
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconExternalLink, IconPencil, IconShieldCheck, IconShieldSearch } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, ControlRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { useAnulacionVulnerabilidad, useVulnerabilidad, type Vulnerabilidad } from './api/vulnerabilidades.ts'
import { BadgeEstado, BadgeNivel, BadgeSla } from './componentes/Badges.tsx'
import { EditarVulnerabilidadModal } from './componentes/EditarVulnerabilidadModal.tsx'
import { Remediacion } from './componentes/Remediacion.tsx'
import { admiteEdicion, INFO_ESTADO } from './riesgo.ts'

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

/** Nombres de los campos, para las trazas. */
const ETIQUETAS_VULNERABILIDAD: Record<string, string> = {
  activoId: 'Sistema (activo)',
  fecha: 'Fecha de detección',
  descripcion: 'Vulnerabilidad',
  nivelRiesgo: 'Criticidad',
  responsable: 'Responsable',
  cve: 'CVE',
  fechaLimite: 'Plazo de remediación',
  estado: 'Estado',
  tratamientoIniciadoEn: 'Inicio de la remediación',
  fechaRemediacion: 'Fecha de remediación',
  evidencia: 'Verificable',
  repositorioVerificable: 'Repositorio verificable',
  observacion: 'Observación',
  cerradaPor: 'Remediación registrada por',
}

/** Fase 1 · Detección: los datos con que se registró (corregibles con motivo mientras está pendiente). */
function Deteccion({ v }: { v: Vulnerabilidad }) {
  const puedeOperar = usePuedeOperar()
  const categorias = useCategorias()
  const [editando, edicion] = useDisclosure()
  const clase = categorias.data?.find((c) => c.id === v.activo.categoriaId)?.claseMantenimiento ?? null
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>1 · Detección</Title>
        {puedeOperar && !v.anuladoEn && admiteEdicion(v.estado) && (
          <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
            Corregir detección
          </Button>
        )}
      </Group>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Dato etiqueta="Fecha de detección">{formatearFechaHora(v.fecha)}</Dato>
          <Dato etiqueta="Sistema">
            <Anchor component={Link} to={`/activos/${v.activoId}`} size="sm">
              {v.activo.codigo} · {v.activo.nombre}
            </Anchor>
            <Group gap={6} mt={4}>
              <Text size="xs" c="dimmed">
                {v.activo.categoria}
              </Text>
              <BadgeClase clase={clase} size="xs" />
            </Group>
          </Dato>
          <Dato etiqueta="Criticidad">
            <BadgeNivel nivel={v.nivelRiesgo} />
          </Dato>
        </SimpleGrid>
        <Dato etiqueta="Vulnerabilidad">{v.descripcion}</Dato>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Dato etiqueta="Responsable">{v.responsable ?? '—'}</Dato>
          <Dato etiqueta="CVE">
            {v.cve ? (
              <Anchor href={`https://nvd.nist.gov/vuln/detail/${v.cve}`} target="_blank" rel="noopener noreferrer" size="sm">
                {v.cve} <IconExternalLink size={12} />
              </Anchor>
            ) : (
              '—'
            )}
          </Dato>
          <Dato etiqueta="Plazo de remediación">
            {v.fechaLimite ? (
              <Group gap={6}>
                {formatearFechaHora(v.fechaLimite)}
                <BadgeSla vulnerabilidad={v} />
              </Group>
            ) : (
              'Sin plazo'
            )}
          </Dato>
        </SimpleGrid>
      </Stack>
      <EditarVulnerabilidadModal opened={editando} onClose={edicion.close} vulnerabilidad={v} />
    </Card>
  )
}

export function VulnerabilidadPage() {
  const id = Number(useParams().id)
  const { data: v, isPending, error } = useVulnerabilidad(id)
  const anulacion = useAnulacionVulnerabilidad()
  const [params, setParams] = useSearchParams()

  const migas = (
    <Breadcrumbs>
      <Anchor component={Link} to="/vulnerabilidades">
        Vulnerabilidades
      </Anchor>
      <Text>{v?.cve ?? `#${id}`}</Text>
    </Breadcrumbs>
  )

  if (isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }
  if (error || !v) {
    return (
      <Stack gap="md">
        {migas}
        <Alert color="orange" title="Vulnerabilidad no disponible" maw={560}>
          {error?.message ?? 'La vulnerabilidad no existe.'}
        </Alert>
      </Stack>
    )
  }

  // Pestaña: la de la URL o, por defecto, la fase en la que está.
  const fase = params.get('fase') === 'deteccion' || params.get('fase') === 'remediacion' ? params.get('fase')! : v.estado === 'ABIERTO' ? 'deteccion' : 'remediacion'
  const remediada = v.estado === 'REMEDIADO'

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{v.cve ?? `Vulnerabilidad #${v.id}`}</Title>
            <BadgeNivel nivel={v.nivelRiesgo} />
            <BadgeEstado estado={v.estado} />
          </Group>
          <Text c="dimmed" size="sm" mt={4} lineClamp={2} maw={720}>
            {v.activo.codigo} · {v.activo.nombre} — {v.descripcion}
          </Text>
        </div>
        <ControlRegistro
          registro={v}
          entidad="VULNERABILIDAD"
          registroId={v.id}
          nombre={v.cve ?? `la vulnerabilidad #${v.id}`}
          etiquetas={ETIQUETAS_VULNERABILIDAD}
          enviando={anulacion.isPending}
          onAnulacion={(modo, motivo, listo) =>
            anulacion.mutate(
              { id: v.id, modo, motivo },
              {
                onSuccess: () => {
                  notifications.show({
                    color: 'green',
                    title: modo === 'anular' ? 'Registro anulado' : 'Anulación revertida',
                    message: modo === 'anular' ? 'Se conserva para auditoría y deja de contar en los indicadores.' : 'Vuelve a contar en los indicadores.',
                  })
                  listo()
                },
                onError: (e) => notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
              },
            )
          }
        />
      </Group>
      <AvisoAnulado registro={v} />

      {v.vencida && (
        <Alert color="red" title="Plazo de remediación vencido" maw={720}>
          El plazo ({formatearFechaHora(v.fechaLimite)}) ya pasó y la vulnerabilidad sigue pendiente.
        </Alert>
      )}

      {/* Solo dos fases sobre el mismo registro: Detección y Remediación. */}
      <Card withBorder padding="lg">
        <Stepper active={remediada ? 2 : 1} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Detección" description={formatearFechaHora(v.fecha)}>
            {null}
          </Stepper.Step>
          <Stepper.Step
            label="Remediación"
            description={remediada ? `Remediada · ${formatearFechaHora(v.fechaRemediacion)}` : INFO_ESTADO[v.estado].etiqueta}
          >
            {null}
          </Stepper.Step>
        </Stepper>
      </Card>

      <Tabs
        value={fase}
        onChange={(f) => {
          const nuevos = new URLSearchParams(params)
          nuevos.set('fase', f ?? 'deteccion')
          setParams(nuevos, { replace: true })
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="deteccion" leftSection={<IconShieldSearch size={16} />}>
            1 · Detección
          </Tabs.Tab>
          <Tabs.Tab value="remediacion" leftSection={<IconShieldCheck size={16} />}>
            2 · Remediación
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="deteccion" pt="md">
          <Deteccion v={v} />
        </Tabs.Panel>
        <Tabs.Panel value="remediacion" pt="md">
          <Remediacion v={v} />
        </Tabs.Panel>
      </Tabs>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Dato etiqueta="Fecha de registro (automática)">{formatearFechaHora(v.createdAt)}</Dato>
        <Dato etiqueta="Última actualización">{formatearFechaHora(v.updatedAt)}</Dato>
      </SimpleGrid>
    </Stack>
  )
}
