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
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconCheck,
  IconExternalLink,
  IconPlayerPlay,
  IconShieldExclamation,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import {
  useIniciarMitigacion,
  useVulnerabilidad,
  type Vulnerabilidad,
} from './api/vulnerabilidades.ts'
import { BadgeEstado, BadgeNivel, BadgeSla } from './componentes/Badges.tsx'
import { CierreModal } from './componentes/CierreModal.tsx'
import { accionesPermitidas, pasoActivo, pasosCiclo, type Paso } from './riesgo.ts'

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

/** Etiqueta, fecha y estilo de cada paso del Stepper. */
function propsPaso(paso: Paso, v: Vulnerabilidad) {
  switch (paso.clave) {
    case 'abierta':
      return { label: 'Detectada', description: formatearFechaHora(v.fecha) }
    case 'mitigacion':
      return { label: 'En mitigación' }
    case 'mitigada':
      return {
        label: 'Mitigada',
        description: paso.hecho ? formatearFechaHora(v.fechaCierre) : undefined,
      }
    case 'aceptada':
      return {
        label: 'Riesgo aceptado',
        description: formatearFechaHora(v.fechaCierre),
        color: 'grape',
        completedIcon: <IconShieldExclamation size={18} />,
      }
  }
}

/**
 * Botones de transición según el estado. "Iniciar mitigación" y "Mitigar":
 * admin y analista. "Aceptar riesgo": solo admin.
 */
function Acciones({ vulnerabilidad: v }: { vulnerabilidad: Vulnerabilidad }) {
  const puedeOperar = usePuedeOperar()
  const puedeAceptar = usePuedeAdministrar()
  const iniciar = useIniciarMitigacion()
  const [mitigando, mitigar] = useDisclosure()
  const [aceptando, aceptar] = useDisclosure()
  const acciones = accionesPermitidas(v.estado)

  const confirmarInicio = () =>
    modals.openConfirmModal({
      title: 'Iniciar mitigación',
      children: (
        <Text size="sm">
          La vulnerabilidad pasará a <b>En mitigación</b>. Cuando se aplique la corrección,
          márcala como mitigada.
        </Text>
      ),
      labels: { confirm: 'Iniciar mitigación', cancel: 'Volver' },
      confirmProps: { color: 'yellow' },
      onConfirm: () =>
        iniciar.mutate(v.id, {
          onSuccess: () =>
            notifications.show({
              color: 'yellow',
              title: 'Mitigación iniciada',
              message: v.cve ?? `Vulnerabilidad #${v.id}`,
            }),
          onError: (e) =>
            notifications.show({ color: 'red', title: 'No se pudo iniciar', message: e.message }),
        }),
    })

  const verIniciar = puedeOperar && acciones.includes('iniciar-mitigacion')
  const verMitigar = puedeOperar && acciones.includes('mitigar')
  const verAceptar = puedeAceptar && acciones.includes('aceptar-riesgo')
  if (!verIniciar && !verMitigar && !verAceptar) return null

  return (
    <>
      <Group gap="sm">
        {verIniciar && (
          <Button
            color="yellow"
            leftSection={<IconPlayerPlay size={16} />}
            loading={iniciar.isPending}
            onClick={confirmarInicio}
          >
            Iniciar mitigación
          </Button>
        )}
        {verMitigar && (
          <Button color="green" leftSection={<IconCheck size={16} />} onClick={mitigar.open}>
            Marcar como mitigada
          </Button>
        )}
        {verAceptar && (
          <Button
            color="grape"
            variant="light"
            leftSection={<IconShieldExclamation size={16} />}
            onClick={aceptar.open}
          >
            Aceptar riesgo
          </Button>
        )}
      </Group>
      {verMitigar && (
        <CierreModal opened={mitigando} onClose={mitigar.close} vulnerabilidadId={v.id} modo="mitigar" />
      )}
      {verAceptar && (
        <CierreModal opened={aceptando} onClose={aceptar.close} vulnerabilidadId={v.id} modo="aceptar" />
      )}
    </>
  )
}

export function VulnerabilidadPage() {
  const id = Number(useParams().id)
  const { data: v, isPending, error } = useVulnerabilidad(id)

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

  const pasos = pasosCiclo(v.estado)

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
          <Text c="dimmed" size="sm" mt={4}>
            Activo:{' '}
            <Anchor component={Link} to={`/activos/${v.activoId}`}>
              {v.activo.codigo} · {v.activo.nombre}
            </Anchor>
          </Text>
        </div>
        <Acciones vulnerabilidad={v} />
      </Group>

      {v.vencida && (
        <Alert color="red" title="Plazo (SLA) vencido" maw={720}>
          La fecha límite ({formatearFechaHora(v.fechaLimite)}) ya pasó y la vulnerabilidad
          sigue pendiente.
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stepper active={pasoActivo(pasos)} allowNextStepsSelect={false}>
          {pasos.map((p) => (
            <Stepper.Step key={p.clave} {...propsPaso(p, v)}>
              {null}
            </Stepper.Step>
          ))}
        </Stepper>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Detalle
        </Title>
        <Stack gap="md">
          <Dato etiqueta="Descripción">{v.descripcion}</Dato>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="CVE">
              {v.cve ? (
                <Anchor
                  href={`https://nvd.nist.gov/vuln/detail/${v.cve}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                >
                  {v.cve} <IconExternalLink size={12} />
                </Anchor>
              ) : (
                '—'
              )}
            </Dato>
            <Dato etiqueta="Nivel de riesgo">
              <BadgeNivel nivel={v.nivelRiesgo} />
            </Dato>
            <Dato etiqueta="Plazo (SLA)">
              <BadgeSla vulnerabilidad={v} />
            </Dato>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Detectada">{formatearFechaHora(v.fecha)}</Dato>
            <Dato etiqueta="Fecha límite">{formatearFechaHora(v.fechaLimite)}</Dato>
            <Dato etiqueta="Cierre">{formatearFechaHora(v.fechaCierre)}</Dato>
          </SimpleGrid>
          {v.mitigacion && (
            <Alert
              color={v.estado === 'ACEPTADA' ? 'grape' : 'green'}
              title={v.estado === 'ACEPTADA' ? 'Justificación de la aceptación' : 'Mitigación aplicada'}
            >
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {v.mitigacion}
              </Text>
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Registrada">{formatearFechaHora(v.createdAt)}</Dato>
            <Dato etiqueta="Última actualización">{formatearFechaHora(v.updatedAt)}</Dato>
          </SimpleGrid>
        </Stack>
      </Card>
    </Stack>
  )
}
