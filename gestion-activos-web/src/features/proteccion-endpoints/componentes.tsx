import { Alert, Anchor, Badge, Button, Center, Divider, Group, Loader, Modal, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { Select, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCategoriasConActivos } from '../inventario/api/activos.ts'
import { Dato, EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { AvisoAnulado, BadgeRegistro, HistorialTrazas } from '../../shared/registro/componentes.tsx'
import { useTrazas } from '../../shared/registro/trazas.ts'
import { usePuedeAdministrar } from '../auth/use-puede.ts'
import { useComparacionInventario, useEquiposPeriodo, type PeriodoEndpoint } from './api.ts'
import { ultimoCierre } from '../../shared/registro/registro.ts'
import { ETIQUETAS_TRAZA, INFO_ESTADO, nombrePeriodo } from './textos.ts'

export function BadgeEstadoPeriodo({ estado, porEjecutar = false }: { estado: PeriodoEndpoint['estado']; porEjecutar?: boolean }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Badge size="sm" variant="light" color={INFO_ESTADO[estado].color} style={{ minWidth: 'max-content' }}>
        {INFO_ESTADO[estado].etiqueta}
      </Badge>
      {porEjecutar && (
        <Badge size="sm" variant="filled" color="red" style={{ minWidth: 'max-content' }}>
          Por ejecutar
        </Badge>
      )}
    </Group>
  )
}

/**
 * Filtros por equipo (código o nombre) y por categoría: períodos que incluyen ese activo real.
 * Las categorías son solo las habilitadas para Protección de endpoints.
 */
export function FiltrosEquipo({ onCambio }: { onCambio: (f: { activo?: string; categoriaId?: number }) => void }) {
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [activo] = useDebouncedValue(texto.trim(), 300)
  const categorias = useCategoriasConActivos({ operativos: false, aplica: 'ENDPOINT' })
  useEffect(() => onCambio({ activo: activo || undefined, categoriaId: categoria ? Number(categoria) : undefined }), [activo, categoria]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TextInput label="Equipo" placeholder="Código o nombre" leftSection={<IconSearch size={14} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} w={{ base: '100%', sm: 180 }} />
      <Select
        label="Categoría"
        placeholder="Todas"
        clearable
        data={(categorias.data ?? []).map((c) => ({ value: String(c.categoriaId), label: c.nombre }))}
        value={categoria}
        onChange={setCategoria}
        w={{ base: '100%', sm: 180 }}
      />
    </>
  )
}

/**
 * Explica la diferencia entre los equipos del período (copiados al abrirlo) y los elegibles de
 * hoy. Solo informa: el total del período no cambia por sí solo.
 */
export function AvisoInventario({ p }: { p: PeriodoEndpoint }) {
  const c = useComparacionInventario(p.id, p.conDetalle)
  if (!p.conDetalle || !c.data) return null
  const { equiposPeriodo, elegiblesHoy, nuevos, yaNoElegibles } = c.data
  const codigos = (l: { codigo: string }[]) => l.slice(0, 8).map((a) => a.codigo).join(', ') + (l.length > 8 ? `… (+${l.length - 8})` : '')
  const sinDiferencias = !nuevos.length && !yaNoElegibles.length
  return (
    <Alert variant="light" color={sinDiferencias ? 'gray' : 'blue'} title="Equipos del período frente al inventario de hoy">
      <Text size="sm">
        Este período tiene <b>{equiposPeriodo}</b> equipo(s), copiados del inventario al abrirlo el {formatearFechaHora(p.createdAt)}. Hoy hay <b>{elegiblesHoy}</b> elegible(s).
        {sinDiferencias && ' Coinciden.'}
      </Text>
      {nuevos.length > 0 && (
        <Text size="sm">
          {nuevos.length} entraron después y no forman parte de este período: {codigos(nuevos)}.
        </Text>
      )}
      {yaNoElegibles.length > 0 && (
        <Text size="sm">
          {yaNoElegibles.length} ya no son elegibles (baja, fuera de GLPI o de otra categoría) y se conservan en el período: {codigos(yaNoElegibles)}.
        </Text>
      )}
    </Alert>
  )
}

/** Equipos del período con su antivirus, de solo lectura (los períodos anteriores no tienen detalle). */
export function TablaEquipos({ p }: { p: PeriodoEndpoint }) {
  const equipos = useEquiposPeriodo(p.id, p.conDetalle)
  if (!p.conDetalle) {
    return (
      <Text size="sm" c="dimmed">
        Período sin detalle por equipo: sus totales se registraron a mano.
      </Text>
    )
  }
  if (equipos.isPending) return <Center py="sm"><Loader size="sm" /></Center>
  if (equipos.error) return <Alert color="red">{equipos.error.message}</Alert>
  return (
    <ScrollArea.Autosize mah={280} type="auto">
      <Table striped verticalSpacing={4} fz="sm" stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Categoría</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Antivirus</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {equipos.data.map((e) => (
            <Table.Tr key={e.activoId}>
              <Table.Td>{e.activo.codigo}</Table.Td>
              <Table.Td>{e.activo.nombre}</Table.Td>
              <Table.Td>{e.activo.categoria}</Table.Td>
              <Table.Td>{e.activo.tipo ?? '—'}</Table.Td>
              <Table.Td>
                {e.conAntivirus === null ? (
                  <Text span size="sm" c="dimmed">Sin registrar</Text>
                ) : (
                  <Badge size="sm" variant="light" color={e.conAntivirus ? 'green' : 'red'} style={{ minWidth: 'max-content' }}>
                    {e.conAntivirus ? 'Con antivirus' : 'Sin antivirus'}
                  </Badge>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
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
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
          Equipos sujetos a control
        </Text>
        <TablaEquipos p={p} />
      </div>
    </Stack>
  )
}

/** Datos de la planificación del período, de solo lectura. */
export function DatosPlanificacion({ p }: { p: PeriodoEndpoint }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Dato etiqueta="Fecha planificada">{p.fechaPlanificada ? formatearFechaHora(p.fechaPlanificada) : 'No registrada (período anterior a la fecha planificada)'}</Dato>
      <Dato etiqueta="Período (calculado)">
        {nombrePeriodo(p.anio, p.mes)} · {p.semestre}
      </Dato>
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
          <BadgeEstadoPeriodo estado={p.estado} porEjecutar={p.porEjecutar} />
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
