import { Alert, Anchor, Badge, Button, Divider, Group, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { Dato, EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, BadgeRegistro, HistorialTrazas } from '../../shared/registro/componentes.tsx'
import { useTrazas } from '../../shared/registro/trazas.ts'
import { usePuedeAdministrar } from '../auth/use-puede.ts'
import type { PeriodoEndpoint } from './api.ts'
import { ETIQUETAS_TRAZA, INFO_ESTADO, nombrePeriodo, ultimoCierre } from './textos.ts'

export function BadgeEstadoPeriodo({ estado }: { estado: PeriodoEndpoint['estado'] }) {
  return (
    <Badge size="sm" variant="light" color={INFO_ESTADO[estado].color} style={{ minWidth: 'max-content' }}>
      {INFO_ESTADO[estado].etiqueta}
    </Badge>
  )
}

export function BadgeCobertura({ cobertura }: { cobertura: number | null }) {
  if (cobertura === null) return <>—</>
  return (
    <Badge variant="light" color={cobertura >= 95 ? 'green' : cobertura >= 80 ? 'yellow' : 'red'}>
      {cobertura} %
    </Badge>
  )
}

/** Datos de la ejecución y el cierre, de solo lectura. La fecha de cierre sale de la auditoría. */
export function DatosEjecucion({ p }: { p: PeriodoEndpoint }) {
  const cerrado = p.estado === 'CERRADO'
  const trazas = useTrazas('PERIODO_ENDPOINT', p.id, cerrado)
  const fechaCierre = cerrado ? ultimoCierre(trazas.data ?? []) : null
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Dato etiqueta="Total de activos">{p.totalActivos ?? '—'}</Dato>
        <Dato etiqueta="Con antivirus">{p.equiposConAntivirus ?? '—'}</Dato>
        <Dato etiqueta="Sin antivirus">{p.equiposSinAntivirus ?? '—'}</Dato>
        <Dato etiqueta="Cobertura">{p.cobertura === null ? '—' : `${p.cobertura} %`}</Dato>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Dato etiqueta="Fecha real de ejecución">{formatearFechaHora(p.fechaEjecucion)}</Dato>
        <Dato etiqueta="Responsable de la ejecución">{p.responsableEjecucion ?? '—'}</Dato>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Dato etiqueta="Evidencia verificable">{p.evidencia ?? '—'}</Dato>
        <Dato etiqueta="Repositorio verificable">
          <EnlaceRepositorio valor={p.repositorioVerificable} />
        </Dato>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Dato etiqueta="Fecha de cierre">{fechaCierre ? formatearFechaHora(fechaCierre) : '—'}</Dato>
        <Dato etiqueta="Cerrado por">{p.cerradoPor ?? '—'}</Dato>
      </SimpleGrid>
      {p.observacion && <Dato etiqueta="Observaciones">{p.observacion}</Dato>}
    </Stack>
  )
}

/** Datos de la planificación del período, de solo lectura. */
export function DatosPlanificacion({ p }: { p: PeriodoEndpoint }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Dato etiqueta="Período">{nombrePeriodo(p.anio, p.mes)}</Dato>
      <Dato etiqueta="Responsable asignado">{p.responsable}</Dato>
      <Dato etiqueta="Abierto el (registro)">{formatearFechaHora(p.createdAt)}</Dato>
    </SimpleGrid>
  )
}

/**
 * Detalle de un período, solo de consulta: no modifica nada. Corregir o reabrir se hace en la
 * ficha, con el flujo autorizado, y queda en la auditoría.
 */
export function DetallePeriodoModal({ p, onCerrar }: { p: PeriodoEndpoint; onCerrar: () => void }) {
  const esAdmin = usePuedeAdministrar()
  return (
    <Modal opened onClose={onCerrar} size="xl" title={`Detalle del período · ${nombrePeriodo(p.anio, p.mes)}`}>
      <Stack gap="md">
        <AvisoAnulado registro={p} />
        <Group gap="xs">
          <BadgeEstadoPeriodo estado={p.estado} />
          <BadgeRegistro registro={p} />
        </Group>
        <div>
          <Title order={5} mb="xs">Planificación</Title>
          <DatosPlanificacion p={p} />
        </div>
        <Divider />
        <div>
          <Title order={5} mb="xs">Ejecución, resultados y cierre</Title>
          <DatosEjecucion p={p} />
        </div>
        <Divider />
        <div>
          <Title order={5} mb="xs">Historial de auditoría</Title>
          <HistorialTrazas entidad="PERIODO_ENDPOINT" registroId={p.id} etiquetas={ETIQUETAS_TRAZA} />
        </div>
        <Divider />
        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed" maw={480}>
            {p.estado === 'CERRADO' && esAdmin
              ? 'Este detalle es de consulta. Para corregir el período, reábralo desde su ficha, con motivo: queda en la auditoría.'
              : 'Este detalle es de consulta y no modifica el registro.'}
          </Text>
          <Anchor component={Link} to={`/proteccion-endpoints/${p.id}`} size="sm">
            Ir a la ficha del período
          </Anchor>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Lo que quedará registrado al cerrar: se confirma antes de enviarlo. */
export interface ResumenCierre {
  anio: number
  mes: number
  totalActivos: number
  equiposConAntivirus: number
  fechaEjecucion: string
  responsableEjecucion: string
  evidencia: string
  repositorioVerificable: string
}

export function ConfirmarCierreModal({
  abierto,
  resumen: r,
  enviando,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean
  resumen: ResumenCierre | null
  enviando: boolean
  onConfirmar: () => void
  onCerrar: () => void
}) {
  return (
    <Modal opened={abierto && r !== null} onClose={onCerrar} title="Confirmar el cierre del período" size="lg">
      {r && (
        <Stack gap="sm">
          <Alert variant="light" color="orange">
            Va a cerrar <b>{nombrePeriodo(r.anio, r.mes)}</b>. Quedará de solo lectura; solo un administrador puede reabrirlo.
          </Alert>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Dato etiqueta="Total de activos">{r.totalActivos}</Dato>
            <Dato etiqueta="Con antivirus">{r.equiposConAntivirus}</Dato>
            <Dato etiqueta="Sin antivirus">{r.totalActivos - r.equiposConAntivirus}</Dato>
            <Dato etiqueta="Cobertura">{Math.round((r.equiposConAntivirus / r.totalActivos) * 1000) / 10} %</Dato>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Dato etiqueta="Fecha real de ejecución">{formatearFechaHora(r.fechaEjecucion)}</Dato>
            <Dato etiqueta="Responsable de la ejecución">{r.responsableEjecucion}</Dato>
            <Dato etiqueta="Evidencia verificable">{r.evidencia}</Dato>
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
