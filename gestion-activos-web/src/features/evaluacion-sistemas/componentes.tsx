import { Alert, Anchor, Badge, Button, Divider, Group, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { Dato, EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, BadgeRegistro, HistorialTrazas } from '../../shared/registro/componentes.tsx'
import { ultimoCierre } from '../../shared/registro/registro.ts'
import { useTrazas } from '../../shared/registro/trazas.ts'
import { usePuedeAdministrar } from '../auth/use-puede.ts'
import type { EvaluacionSistema } from './api.ts'
import { ETIQUETAS_TRAZA, INFO_ESTADO, periodoPlanificado } from './textos.ts'

/** Estado de la evaluación; «Por ejecutar» si sigue abierta y su fecha planificada ya pasó. */
export function BadgeEstadoEvaluacion({ e }: { e: Pick<EvaluacionSistema, 'estado' | 'vencida'> }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Badge size="sm" variant="light" color={INFO_ESTADO[e.estado].color} style={{ minWidth: 'max-content' }}>
        {INFO_ESTADO[e.estado].etiqueta}
      </Badge>
      {e.vencida && (
        <Badge size="sm" variant="filled" color="red" style={{ minWidth: 'max-content' }}>
          {e.estado === 'ABIERTO' ? 'Por ejecutar' : 'Vencida'}
        </Badge>
      )}
    </Group>
  )
}

export function DatosPlanificacionEvaluacion({ e }: { e: EvaluacionSistema }) {
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Dato etiqueta="Sistema (activo del inventario)">
          <Anchor component={Link} to={`/activos/${e.activoId}`} size="sm">
            {e.activo.codigo} · {e.activo.nombre}
          </Anchor>
          <Text size="xs" c="dimmed">
            {e.activo.categoria}
            {e.activo.tipo ? ` · ${e.activo.tipo}` : ''}
          </Text>
        </Dato>
        <Dato etiqueta="Fecha planificada de evaluación">
          <Text size="sm" c={e.vencida ? 'red' : undefined} fw={e.vencida ? 600 : undefined}>
            {formatearFechaHora(e.fechaProgramadaProduccion)}
          </Text>
          <Text size="xs" c="dimmed">
            {periodoPlanificado(e)} (paso a producción)
          </Text>
        </Dato>
        <Dato etiqueta="Responsable asignado">{e.responsable}</Dato>
      </SimpleGrid>
      <Dato etiqueta="Descripción">{e.descripcion}</Dato>
      <Dato etiqueta="Registrada el (no es una fecha de negocio)">{formatearFechaHora(e.createdAt)}</Dato>
    </Stack>
  )
}

/** Ejecución y cierre, de solo lectura. La fecha de cierre sale de la auditoría (no hay columna). */
export function DatosEjecucionEvaluacion({ e }: { e: EvaluacionSistema }) {
  const cerrada = e.estado === 'CERRADO'
  const trazas = useTrazas('EVALUACION_SISTEMA', e.id, cerrada)
  const fechaCierre = cerrada ? ultimoCierre(trazas.data ?? []) : null
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Dato etiqueta="Fecha real de las pruebas">
          {formatearFechaHora(e.fechaPruebas)}
          {e.tardia && (
            <Badge size="xs" color="orange" variant="light" ml={6}>
              Posterior a lo planificado
            </Badge>
          )}
        </Dato>
        <Dato etiqueta="Responsable de la ejecución">{e.responsableEjecucion ?? '—'}</Dato>
        <Dato etiqueta="Semestre real">{e.semestreReal ?? '—'}</Dato>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Dato etiqueta="Verificable (informe de seguridad)">{e.evidencia ?? '—'}</Dato>
        <Dato etiqueta="Repositorio verificable">
          <EnlaceRepositorio valor={e.repositorioVerificable} />
        </Dato>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Dato etiqueta="Fecha de cierre">{fechaCierre ? formatearFechaHora(fechaCierre) : '—'}</Dato>
        <Dato etiqueta="Cerrada por">{e.cerradoPor ?? '—'}</Dato>
      </SimpleGrid>
      {e.observacion && <Dato etiqueta="Observaciones">{e.observacion}</Dato>}
    </Stack>
  )
}

/** Detalle de consulta: no modifica nada. Corregir o reabrir se hace en la ficha y queda en la auditoría. */
export function DetalleEvaluacionModal({ e, onCerrar }: { e: EvaluacionSistema; onCerrar: () => void }) {
  const esAdmin = usePuedeAdministrar()
  return (
    <Modal opened onClose={onCerrar} size="xl" title={`Detalle de la evaluación #${e.id} · ${e.activo.codigo}`}>
      <Stack gap="md">
        <AvisoAnulado registro={e} />
        <Group gap="xs">
          <BadgeEstadoEvaluacion e={e} />
          <BadgeRegistro registro={e} />
        </Group>
        <div>
          <Title order={5} mb="xs">Planificación</Title>
          <DatosPlanificacionEvaluacion e={e} />
        </div>
        <Divider />
        <div>
          <Title order={5} mb="xs">Ejecución y cierre</Title>
          <DatosEjecucionEvaluacion e={e} />
        </div>
        <Divider />
        <div>
          <Title order={5} mb="xs">Historial de auditoría</Title>
          <HistorialTrazas entidad="EVALUACION_SISTEMA" registroId={e.id} etiquetas={ETIQUETAS_TRAZA} />
        </div>
        <Divider />
        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed" maw={480}>
            {e.estado === 'CERRADO' && esAdmin
              ? 'Este detalle es de consulta. Para corregir la evaluación, reábrala desde su ficha, con motivo: queda en la auditoría.'
              : 'Este detalle es de consulta y no modifica el registro.'}
          </Text>
          <Anchor component={Link} to={`/evaluacion-sistemas-productivos/${e.id}`} size="sm">
            Ir a la ficha de la evaluación
          </Anchor>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Lo que quedará registrado al cerrar: se confirma antes de enviarlo. */
export interface ResumenCierreEvaluacion {
  codigo: string
  fechaPruebas: string
  responsableEjecucion: string
  evidencia: string
  repositorioVerificable: string
  tardia: boolean
}

export function ConfirmarCierreEvaluacionModal({
  resumen: r,
  enviando,
  onConfirmar,
  onCerrar,
}: {
  resumen: ResumenCierreEvaluacion | null
  enviando: boolean
  onConfirmar: () => void
  onCerrar: () => void
}) {
  return (
    <Modal opened={r !== null} onClose={onCerrar} title="Confirmar el cierre de la evaluación" size="lg">
      {r && (
        <Stack gap="sm">
          <Alert variant="light" color="orange">
            Va a cerrar la evaluación de <b>{r.codigo}</b>. Quedará de solo lectura; solo un administrador puede reabrirla.
          </Alert>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Dato etiqueta="Fecha real de las pruebas">
              {formatearFechaHora(r.fechaPruebas)}
              {r.tardia && (
                <Badge size="xs" color="orange" variant="light" ml={6}>
                  Con justificación del retraso
                </Badge>
              )}
            </Dato>
            <Dato etiqueta="Responsable de la ejecución">{r.responsableEjecucion}</Dato>
            <Dato etiqueta="Verificable (informe de seguridad)">{r.evidencia}</Dato>
            <Dato etiqueta="Repositorio verificable">
              <EnlaceRepositorio valor={r.repositorioVerificable} />
            </Dato>
          </SimpleGrid>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onCerrar} disabled={enviando}>
              Volver
            </Button>
            <Button color="green" loading={enviando} onClick={onConfirmar}>
              Confirmar cierre
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
