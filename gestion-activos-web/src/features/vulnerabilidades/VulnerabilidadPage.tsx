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
  Stepper,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconArchive,
  IconChecklist,
  IconCircleCheck,
  IconClipboardList,
  IconExternalLink,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconShieldExclamation,
} from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, BadgeRegistro, ControlRegistro, MotivoModal } from '../../shared/registro/componentes.tsx'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import {
  useAccionesRemediacion,
  useAnulacionVulnerabilidad,
  useAnularAccion,
  useAnularVerificacionVulnerabilidad,
  useConfirmarVulnerabilidad,
  useVerificacionesVulnerabilidad,
  useVulnerabilidad,
  type Vulnerabilidad,
} from './api/vulnerabilidades.ts'
import { BadgeEstado, BadgeNivel, BadgeSla } from './componentes/Badges.tsx'
import { AceptarRiesgoModal } from './componentes/CierreModal.tsx'
import { EditarVulnerabilidadModal } from './componentes/EditarVulnerabilidadModal.tsx'
import { PlazosVulnerabilidad } from './componentes/PlazosVulnerabilidad.tsx'
import { AccionModal, EvaluarModal, IniciarTratamientoModal, VerificarModal } from './componentes/Tratamiento.tsx'
import { accionesPermitidas, admiteEdicion, INFO_FUENTE, INFO_PRIORIDAD, pasoActivo, pasosCiclo, type Paso } from './riesgo.ts'

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
    case 'detectada':
      return { label: 'Detectada', description: formatearFechaHora(v.fecha) }
    case 'confirmada':
      return { label: 'Confirmada', description: v.confirmadaEn ? `${formatearFechaHora(v.confirmadaEn)} · ${v.confirmadaPor}` : undefined }
    case 'evaluada':
      return { label: 'Evaluada', description: v.evaluadaEn ? `${formatearFechaHora(v.evaluadaEn)} · ${v.evaluadaPor}` : undefined }
    case 'tratamiento':
      return { label: 'En tratamiento' }
    case 'cerrada':
      return { label: 'Verificada y cerrada', description: paso.hecho ? `${formatearFechaHora(v.fechaCierre)} · ${v.cerradaPor ?? ''}` : undefined }
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
 * Botones según la etapa. Confirmar, evaluar, iniciar, acciones y
 * verificaciones: admin y analista. Aceptar el riesgo: solo admin.
 * Nadie la marca "mitigada" a mano: la cierra una verificación.
 */
function Acciones({ vulnerabilidad: v, accionesVigentes }: { vulnerabilidad: Vulnerabilidad; accionesVigentes: number }) {
  const puedeOperar = usePuedeOperar()
  const puedeAceptar = usePuedeAdministrar()
  const confirmar = useConfirmarVulnerabilidad()
  const [iniciando, inicio] = useDisclosure()
  const [evaluando, evaluacion] = useDisclosure()
  const [registrandoAccion, accion] = useDisclosure()
  const [verificando, verificacion] = useDisclosure()
  const [aceptando, aceptar] = useDisclosure()
  const acciones = accionesPermitidas(v)
  const ver = (a: (typeof acciones)[number]) => (a === 'aceptar-riesgo' ? puedeAceptar : puedeOperar) && acciones.includes(a)

  const confirmarHallazgo = () =>
    modals.openConfirmModal({
      title: 'Confirmar la vulnerabilidad',
      children: (
        <Text size="sm">
          Confirma que el hallazgo se comprobó y es real. Quedará registrado quién y cuándo lo confirmó.
        </Text>
      ),
      labels: { confirm: 'Confirmar', cancel: 'Volver' },
      onConfirm: () =>
        confirmar.mutate(v.id, {
          onSuccess: () => notifications.show({ color: 'blue', title: 'Vulnerabilidad confirmada', message: 'Siguiente paso: evaluarla.' }),
          onError: (e) => notifications.show({ color: 'red', title: 'No se pudo confirmar', message: e.message }),
        }),
    })


  return (
    <>
      <Group gap="sm">
        {ver('confirmar') && (
          <Button leftSection={<IconCircleCheck size={16} />} loading={confirmar.isPending} onClick={confirmarHallazgo}>
            Confirmar
          </Button>
        )}
        {ver('evaluar') && (
          <Button variant={v.evaluadaEn ? 'light' : 'filled'} leftSection={<IconClipboardList size={16} />} onClick={evaluacion.open}>
            {v.evaluadaEn ? 'Reevaluar' : 'Evaluar'}
          </Button>
        )}
        {ver('iniciar-mitigacion') && (
          <Button color="yellow" leftSection={<IconPlayerPlay size={16} />} onClick={inicio.open}>
            Iniciar tratamiento
          </Button>
        )}
        {ver('registrar-accion') && (
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={accion.open}>
            Acción correctiva
          </Button>
        )}
        {ver('verificar') && (
          <Button color={v.estado === 'MITIGADA' ? 'orange' : 'green'} variant={v.estado === 'MITIGADA' ? 'light' : 'filled'} leftSection={<IconChecklist size={16} />} onClick={verificacion.open}>
            {v.estado === 'MITIGADA' ? 'Comprobar si persiste' : 'Verificar'}
          </Button>
        )}
        {ver('aceptar-riesgo') && (
          <Button color="grape" variant="light" leftSection={<IconShieldExclamation size={16} />} onClick={aceptar.open}>
            Aceptar riesgo
          </Button>
        )}
      </Group>
      <EvaluarModal opened={evaluando} onClose={evaluacion.close} vulnerabilidad={v} />
      <IniciarTratamientoModal opened={iniciando} onClose={inicio.close} vulnerabilidad={v} />
      <AccionModal opened={registrandoAccion} onClose={accion.close} vulnerabilidad={v} />
      <VerificarModal opened={verificando} onClose={verificacion.close} vulnerabilidad={v} accionesVigentes={accionesVigentes} />
      {puedeAceptar && <AceptarRiesgoModal opened={aceptando} onClose={aceptar.close} vulnerabilidadId={v.id} />}
    </>
  )
}

/** Registrado fuera del intervalo previsto, como excepción autorizada. */
function MarcaExcepcion({ registro: r }: { registro: { fueraDePlazo: boolean; motivoExcepcion: string | null; excepcionPor: string | null } }) {
  if (!r.fueraDePlazo) return null
  return (
    <Text size="xs" c="orange" title={`${r.motivoExcepcion ?? ''} (autorizó ${r.excepcionPor ?? '—'})`}>
      ⚠ fuera de plazo
    </Text>
  )
}

/** Acciones correctivas (capa 2) y verificaciones (capa 3), con anulación (admin). */
function Historial({ v }: { v: Vulnerabilidad }) {
  const acciones = useAccionesRemediacion(v.id)
  const verificaciones = useVerificacionesVulnerabilidad(v.id)
  const puedeAnular = usePuedeAdministrar()
  const anularAccion = useAnularAccion()
  const anularVerificacion = useAnularVerificacionVulnerabilidad()
  const [anulando, setAnulando] = useState<{ tipo: 'accion' | 'verificacion'; id: number } | null>(null)
  const botonAnular = (tipo: 'accion' | 'verificacion', id: number, anulado: boolean) =>
    puedeAnular && !anulado ? (
      <Button size="compact-xs" variant="light" color="red" leftSection={<IconArchive size={12} />} onClick={() => setAnulando({ tipo, id })}>
        Anular
      </Button>
    ) : null

  return (
    <SimpleGrid cols={{ base: 1, xl: 2 }}>
      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Acciones correctivas
        </Title>
        {acciones.isPending ? (
          <Loader size="sm" />
        ) : acciones.error ? (
          <Alert color="red">{acciones.error.message}</Alert>
        ) : acciones.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            {v.estado === 'EN_MITIGACION' ? 'Aún no se registró ninguna acción.' : 'Se registran durante el tratamiento.'}
          </Text>
        ) : (
          <Table verticalSpacing="xs" fz="sm">
            <Table.Tbody>
              {acciones.data.map((a) => (
                <Table.Tr key={a.id} style={{ opacity: a.anuladoEn ? 0.55 : 1 }}>
                  <Table.Td w={140}>
                    {formatearFechaHora(a.fecha)}
                    <MarcaExcepcion registro={a} />
                  </Table.Td>
                  <Table.Td>
                    {a.descripcion}
                    <Text size="xs" c="dimmed">
                      {a.responsable}
                      {a.evidencia ? ` · evidencia: ${a.evidencia}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td w={56}>
                    <BadgeRegistro registro={a} />
                  </Table.Td>
                  <Table.Td>{botonAnular('accion', a.id, a.anuladoEn !== null)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Verificaciones
        </Title>
        {verificaciones.isPending ? (
          <Loader size="sm" />
        ) : verificaciones.error ? (
          <Alert color="red">{verificaciones.error.message}</Alert>
        ) : verificaciones.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            Solo una verificación «Corregida», con evidencia, cierra la vulnerabilidad.
          </Text>
        ) : (
          <Table verticalSpacing="xs" fz="sm">
            <Table.Tbody>
              {verificaciones.data.map((x) => (
                <Table.Tr key={x.id} style={{ opacity: x.anuladoEn ? 0.55 : 1 }}>
                  <Table.Td w={140}>
                    {formatearFechaHora(x.fecha)}
                    <MarcaExcepcion registro={x} />
                  </Table.Td>
                  <Table.Td w={110}>
                    <Badge color={x.resultado === 'CORREGIDA' ? 'green' : 'orange'}>{x.resultado === 'CORREGIDA' ? 'Corregida' : 'Persiste'}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {x.observaciones}
                    <Text size="xs" c="dimmed">
                      {x.responsable} · evidencia: {x.evidencia}
                    </Text>
                  </Table.Td>
                  <Table.Td w={56}>
                    <BadgeRegistro registro={x} />
                  </Table.Td>
                  <Table.Td>{botonAnular('verificacion', x.id, x.anuladoEn !== null)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
      <MotivoModal
        abierto={anulando !== null}
        modo="anular"
        titulo={anulando?.tipo === 'accion' ? 'Anular la acción correctiva' : 'Anular la verificación'}
        enviando={anularAccion.isPending || anularVerificacion.isPending}
        onCerrar={() => setAnulando(null)}
        onConfirmar={(motivo) => {
          if (!anulando) return
          const opciones = {
            onSuccess: () => {
              notifications.show({ color: 'green', title: 'Registro anulado', message: 'Se conserva para auditoría.' })
              setAnulando(null)
            },
            onError: (e: Error) => notifications.show({ color: 'red', title: 'No se pudo anular', message: e.message }),
          }
          if (anulando.tipo === 'accion') anularAccion.mutate({ id: anulando.id, motivo }, opciones)
          else anularVerificacion.mutate({ id: anulando.id, motivo }, opciones)
        }}
      />
    </SimpleGrid>
  )
}

/** Nombres de los campos, para las trazas. */
const ETIQUETAS_VULNERABILIDAD: Record<string, string> = {
  cve: 'CVE',
  descripcion: 'Descripción',
  nivelRiesgo: 'Nivel de riesgo',
  fecha: 'Fecha de detección',
  fechaLimite: 'Fecha límite (SLA)',
  fechaLimiteOriginal: 'Límite original',
  tratamientoPrevisto: 'Tratamiento previsto',
  tratamientoIniciadoEn: 'Tratamiento iniciado',
  verificacionPrevista: 'Verificación prevista',
  verificacionLimite: 'Límite de la verificación',
  fuente: 'Fuente',
  evidencia: 'Evidencia',
  confirmadaEn: 'Confirmada el',
  confirmadaPor: 'Confirmada por',
  prioridad: 'Prioridad',
  responsable: 'Responsable',
  planRemediacion: 'Plan de remediación',
  evaluadaEn: 'Evaluada el',
  evaluadaPor: 'Evaluada por',
  estado: 'Estado',
}

export function VulnerabilidadPage() {
  const id = Number(useParams().id)
  const { data: v, isPending, error } = useVulnerabilidad(id)
  const acciones = useAccionesRemediacion(id)
  const puedeOperar = usePuedeOperar()
  const anulacion = useAnulacionVulnerabilidad()
  const [editando, edicion] = useDisclosure()

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

  const pasos = pasosCiclo(v)
  const anulada = v.anuladoEn !== null
  const accionesVigentes = (acciones.data ?? []).filter((a) => !a.anuladoEn).length

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{v.cve ?? `Vulnerabilidad #${v.id}`}</Title>
            <BadgeNivel nivel={v.nivelRiesgo} />
            <BadgeEstado estado={v.estado} />
            {v.prioridad && (
              <Badge color={INFO_PRIORIDAD[v.prioridad].color} variant="outline">
                {INFO_PRIORIDAD[v.prioridad].etiqueta}
              </Badge>
            )}
            {!v.confirmadaEn && v.estado === 'ABIERTA' && (
              <Badge color="gray" variant="light">
                Sin confirmar
              </Badge>
            )}
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            Activo:{' '}
            <Anchor component={Link} to={`/activos/${v.activoId}`}>
              {v.activo.codigo} · {v.activo.nombre}
            </Anchor>{' '}
            · {v.activo.categoria}
          </Text>
        </div>
        <Group gap="sm">
          {/* Una anulada no admite cambios de estado ni ediciones. */}
          {!anulada && <Acciones vulnerabilidad={v} accionesVigentes={accionesVigentes} />}
          {puedeOperar && !anulada && admiteEdicion(v.estado) && (
            <Button variant="subtle" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Editar
            </Button>
          )}
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
                      message:
                        modo === 'anular'
                          ? 'Se conserva para auditoría y deja de contar en los indicadores.'
                          : 'Vuelve a contar en los indicadores.',
                    })
                    listo()
                  },
                  onError: (e) => notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
                },
              )
            }
          />
        </Group>
      </Group>
      <EditarVulnerabilidadModal opened={editando} onClose={edicion.close} vulnerabilidad={v} />
      <AvisoAnulado registro={v} />

      {v.vencida && (
        <Alert color="red" title="Plazo (SLA) vencido" maw={720}>
          La fecha límite ({formatearFechaHora(v.fechaLimite)}) ya pasó y la vulnerabilidad sigue pendiente.
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stepper active={pasoActivo(pasos)} allowNextStepsSelect={false} size="sm">
          {pasos.map((p) => (
            <Stepper.Step key={p.clave} {...propsPaso(p, v)}>
              {null}
            </Stepper.Step>
          ))}
        </Stepper>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder padding="lg">
          <Title order={4} mb="sm">
            1 · Identificación
          </Title>
          <Stack gap="md">
            <Dato etiqueta="Descripción">{v.descripcion}</Dato>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Dato etiqueta="CVE">
                {v.cve ? (
                  <Anchor href={`https://nvd.nist.gov/vuln/detail/${v.cve}`} target="_blank" rel="noopener noreferrer" size="sm">
                    {v.cve} <IconExternalLink size={12} />
                  </Anchor>
                ) : (
                  '—'
                )}
              </Dato>
              <Dato etiqueta="Fuente">{INFO_FUENTE[v.fuente]}</Dato>
              <Dato etiqueta="Evidencia">{v.evidencia ?? '—'}</Dato>
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Dato etiqueta="Detectada">{formatearFechaHora(v.fecha)}</Dato>
              <Dato etiqueta="Confirmada">{v.confirmadaEn ? `${formatearFechaHora(v.confirmadaEn)} · ${v.confirmadaPor}` : 'Pendiente'}</Dato>
              <Dato etiqueta="Plazo (SLA)">
                <BadgeSla vulnerabilidad={v} />
              </Dato>
            </SimpleGrid>
          </Stack>
        </Card>
        <Card withBorder padding="lg">
          <Title order={4} mb="sm">
            2 · Evaluación y tratamiento
          </Title>
          {v.evaluadaEn ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Dato etiqueta="Prioridad">{v.prioridad ? INFO_PRIORIDAD[v.prioridad].etiqueta : '—'}</Dato>
                <Dato etiqueta="Responsable">{v.responsable}</Dato>
                <Dato etiqueta="Evaluada">
                  {formatearFechaHora(v.evaluadaEn)} · {v.evaluadaPor}
                </Dato>
              </SimpleGrid>
              <Dato etiqueta="Plan de remediación">{v.planRemediacion}</Dato>
              <Dato etiqueta="Fecha límite">{formatearFechaHora(v.fechaLimite)}</Dato>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {v.confirmadaEn ? 'Pendiente de evaluar: prioridad, responsable y plan.' : 'Se evalúa después de confirmarla.'}
            </Text>
          )}
        </Card>
      </SimpleGrid>

      {/* Tras una reapertura el texto del cierre queda en el historial, no como cierre vigente. */}
      {v.mitigacion && (v.estado === 'MITIGADA' || v.estado === 'ACEPTADA') && (
        <Alert color={v.estado === 'ACEPTADA' ? 'grape' : 'green'} title={v.estado === 'ACEPTADA' ? 'Justificación de la aceptación' : '3 · Cierre por verificación'}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {v.mitigacion}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {formatearFechaHora(v.fechaCierre)} · {v.cerradaPor ?? '—'}
          </Text>
        </Alert>
      )}

      <PlazosVulnerabilidad vulnerabilidad={v} />

      <Historial v={v} />

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Dato etiqueta="Registrada">{formatearFechaHora(v.createdAt)}</Dato>
        <Dato etiqueta="Última actualización">{formatearFechaHora(v.updatedAt)}</Dato>
      </SimpleGrid>
    </Stack>
  )
}
