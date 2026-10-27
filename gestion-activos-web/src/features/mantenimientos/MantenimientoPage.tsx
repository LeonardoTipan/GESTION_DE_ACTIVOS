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
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconEdit, IconPencil, IconPlayerPlay, IconX } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import { Dato, EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { formatearDia, formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, ControlRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import {
  useAnulacionMantenimiento,
  useMantenimiento,
  type Mantenimiento,
} from './api/mantenimientos.ts'
import { EditarMantenimientoModal } from './componentes/EditarMantenimientoModal.tsx'
import {
  BadgeClase,
  BadgeEstadoEquipo,
  BadgeFase,
  BadgeTipo,
  BadgeVencido,
} from './componentes/Badges.tsx'
import { CancelarModal } from './componentes/CancelarModal.tsx'
import { CorregirEjecucionModal } from './componentes/CorregirEjecucionModal.tsx'
import { FinalizarModal } from './componentes/FinalizarModal.tsx'
import { IniciarModal } from './componentes/IniciarModal.tsx'
import { PlazoEjecucion } from './componentes/PlazosMantenimiento.tsx'
import { accionesPermitidas, estadoPasos, INFO_FRECUENCIA, pasoActivo, type EstadoPaso } from './fases.ts'

/** Nombres de los campos, para las trazas. */
const ETIQUETAS_MANTENIMIENTO: Record<string, string> = {
  tipo: 'Tipo',
  fase: 'Situación',
  actividad: 'Descripción prevista',
  fecha: 'Inicio previsto',
  fechaLimite: 'Fecha límite',
  fechaInicio: 'Fecha real de mantenimiento',
  fechaFin: 'Fecha real de finalización',
  fechaCancelacion: 'Fecha de cancelación',
  tecnico: 'Persona encargada',
  resultado: 'Descripción de la ejecución / motivo',
  estadoEquipo: 'Condición del equipo',
  observaciones: 'Observación',
  evidencia: 'Verificable',
  repositorioVerificable: 'Repositorio del verificable',
  diagnostico: 'Diagnóstico',
  duracionMin: 'Duración (min)',
  costo: 'Costo',
  repuestos: 'Repuestos',
  fueraDePlazo: 'Fuera de plazo',
  motivoExcepcion: 'Justificación de la excepción',
  excepcionPor: 'Excepción autorizada por',
}

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
            Completar
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
      <IniciarModal opened={iniciando} onClose={iniciar.close} mantenimiento={mantenimiento} />
      <FinalizarModal opened={finalizando} onClose={finalizar.close} mantenimiento={mantenimiento} />
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
  const categorias = useCategorias()
  const esAdmin = usePuedeAdministrar()
  const anulacion = useAnulacionMantenimiento()
  const [editando, edicion] = useDisclosure()
  const [corrigiendo, correccion] = useDisclosure()

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
  const anulado = m.anuladoEn !== null

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>Ejecución #{m.id}</Title>
            <BadgeTipo tipo={m.tipo} />
            <BadgeClase clase={categorias.data?.find((c) => c.id === m.activo.categoriaId)?.claseMantenimiento ?? null} />
            <BadgeFase fase={m.fase} />
            {m.vencido && <BadgeVencido />}
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            Activo:{' '}
            <Anchor component={Link} to={`/activos/${m.activoId}`}>
              {m.activo.codigo} · {m.activo.nombre}
            </Anchor>{' '}
            · {m.activo.categoria}
            {m.activo.estado ? ` · condición: ${m.activo.estado}` : ''}
            {m.planId && (
              <>
                {' · '}
                <Anchor component={Link} to={`/mantenimientos?planId=${m.planId}`}>
                  planificación PLM-{String(m.planId).padStart(4, '0')}
                </Anchor>
              </>
            )}
          </Text>
        </div>
        <Group gap="sm">
          {/* Un registro anulado no admite cambios de fase ni ediciones. */}
          {puedeOperar && !anulado && <Acciones mantenimiento={m} />}
          {/* Lo planificado solo se corrige antes de iniciar. */}
          {puedeOperar && !anulado && m.fase === 'PROGRAMADO' && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Editar
            </Button>
          )}
          {/* Lo ejecutado se corrige con motivo: en ejecución, quien opera; completada, solo admin. */}
          {puedeOperar && !anulado && (m.fase === 'EN_EJECUCION' || (m.fase === 'FINALIZADO' && esAdmin)) && (
            <Button variant="light" leftSection={<IconEdit size={16} />} onClick={correccion.open}>
              Corregir ejecución
            </Button>
          )}
          <ControlRegistro
            registro={m}
            entidad="MANTENIMIENTO"
            registroId={m.id}
            nombre={`la ejecución #${m.id}`}
            etiquetas={ETIQUETAS_MANTENIMIENTO}
            enviando={anulacion.isPending}
            onAnulacion={(modo, motivo, listo) =>
                anulacion.mutate(
                  { id: m.id, modo, motivo },
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
                    onError: (e) =>
                      notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
                  },
                )}
          />
        </Group>
      </Group>
      <EditarMantenimientoModal opened={editando} onClose={edicion.close} mantenimiento={m} />
      <CorregirEjecucionModal opened={corrigiendo} onClose={correccion.close} mantenimiento={m} />
      <AvisoAnulado registro={m} />

      {m.vencido && (
        <Alert color="red" title="Ejecución vencida" maw={720}>
          Pasó la fecha límite ({formatearFechaHora(m.fechaLimite ?? m.fecha)}) y todavía no se ha completado.
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stepper active={pasoActivo(pasos)} allowNextStepsSelect={false}>
          <Stepper.Step label="Pendiente" description={formatearFechaHora(m.fecha)}>
            {null}
          </Stepper.Step>
          <Stepper.Step
            {...paso(
              ejecucion,
              'En ejecución',
              formatearFechaHora(ejecucion === 'cancelado' ? m.fechaCancelacion : m.fechaInicio),
            )}
          >
            {null}
          </Stepper.Step>
          <Stepper.Step {...paso(cierre, 'Completado', formatearFechaHora(cierre === 'cancelado' ? m.fechaCancelacion : m.fechaFin))}>
            {null}
          </Stepper.Step>
        </Stepper>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Planificación
        </Title>
        {m.plan ? (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 4 }}>
              <Dato etiqueta="Planificación">
                <Anchor component={Link} to={`/mantenimientos?planId=${m.plan.id}`}>
                  PLM-{String(m.plan.id).padStart(4, '0')}
                </Anchor>
              </Dato>
              <Dato etiqueta="Período">{INFO_FRECUENCIA[m.plan.frecuencia]}</Dato>
              <Dato etiqueta="Inicio planificado">
                {formatearDia(m.plan.fechaInicio)}{' '}
                {m.semestrePlanificado && (
                  <Badge size="xs" variant="outline">
                    {m.semestrePlanificado.etiqueta}
                  </Badge>
                )}
              </Dato>
              <Dato etiqueta="Asignado">{m.plan.responsable}</Dato>
            </SimpleGrid>
            <Dato etiqueta="Descripción planificada">{m.plan.actividades}</Dato>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Sin planificación: registro anterior a la separación entre planificación y ejecución.
          </Text>
        )}
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Ejecución
        </Title>
        <Stack gap="md">
          <Dato etiqueta="Descripción prevista">{m.actividad}</Dato>
          <PlazoEjecucion mantenimiento={m} />
          {/* Las fechas reales ya están en el plazo (inicio y fin reales); aquí, su semestre. */}
          {m.semestreReal && (
            <Dato etiqueta="Semestre real (de la fecha real de mantenimiento)">
              {m.semestreReal.etiqueta}
              {m.semestreReal.etiqueta !== m.semestrePlanificado?.etiqueta && m.semestrePlanificado && (
                <Text span size="xs" c="dimmed">
                  {' '}
                  · planificado en {m.semestrePlanificado.etiqueta}: cuenta en ese semestre en la Bitácora General
                </Text>
              )}
            </Dato>
          )}
          {m.fase === 'FINALIZADO' && (
            <>
              <Dato etiqueta="Condición del equipo">
                <BadgeEstadoEquipo estado={m.estadoEquipo} />
              </Dato>
              <Dato etiqueta="Descripción de la ejecución">{m.resultado}</Dato>
            </>
          )}
          {(m.fase === 'FINALIZADO' || m.tecnico) && (
            <SimpleGrid cols={{ base: 1, sm: 4 }}>
              <Dato etiqueta="Persona encargada">{m.tecnico ?? '—'}</Dato>
              <Dato etiqueta="Duración">{m.duracionMin !== null ? `${m.duracionMin} min` : '—'}</Dato>
              <Dato etiqueta="Costo">{m.costo !== null ? `$ ${m.costo.toFixed(2)}` : '—'}</Dato>
              <Dato etiqueta="Verificable">{m.evidencia ?? '—'}</Dato>
            </SimpleGrid>
          )}
          {m.repositorioVerificable && (
            <Dato etiqueta="Repositorio del verificable">
              <EnlaceRepositorio valor={m.repositorioVerificable} />
            </Dato>
          )}
          {m.diagnostico && <Dato etiqueta="Diagnóstico">{m.diagnostico}</Dato>}
          {m.repuestos && <Dato etiqueta="Repuestos">{m.repuestos}</Dato>}
          {m.observaciones && <Dato etiqueta="Observación">{m.observaciones}</Dato>}
          {cancelado && (
            <Alert color="gray" title={`Motivo de la cancelación${m.fechaCancelacion ? ` · ${formatearFechaHora(m.fechaCancelacion)}` : ''}`}>
              {m.resultado}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Fecha de registro (automática)">{formatearFechaHora(m.createdAt)}</Dato>
            <Dato etiqueta="Última actualización">{formatearFechaHora(m.updatedAt)}</Dato>
          </SimpleGrid>
        </Stack>
      </Card>

    </Stack>
  )
}
