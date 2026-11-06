import { Alert, Badge, Button, Card, Center, Group, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BitacoraGeneral, SelectorAnioBitacora } from '../../shared/bitacora/BitacoraGeneral.tsx'
import { CampoBusqueda } from '../../shared/bitacora/CampoBusqueda.tsx'
import { Dato, EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { useTrazas } from '../../shared/registro/trazas.ts'
import { useBitacoraGeneralEndpoints, useEquiposPeriodo, usePeriodos, type PeriodoEndpoint } from './api.ts'
import { BadgeEstadoPeriodo } from './componentes.tsx'
import { nombrePeriodo } from './textos.ts'

type Marca = 'todos' | 'con' | 'sin' | 'pendiente'

/** Cambios de la marca de UN equipo, sacados de la auditoría del período («Equipo CÓDIGO»). */
function HistorialEquipo({ periodoId, codigo }: { periodoId: number; codigo: string }) {
  const trazas = useTrazas('PERIODO_ENDPOINT', periodoId)
  if (trazas.isPending) return <Center py="sm"><Loader size="sm" /></Center>
  if (trazas.error) return <Alert color="red">{trazas.error.message}</Alert>
  const filas = trazas.data.flatMap((t) =>
    t.cambios.filter((c) => c.campo === `Equipo ${codigo}`).map((c) => ({ fecha: t.fecha, responsable: t.responsable, antes: String(c.antes ?? '—'), despues: String(c.despues ?? '—') })),
  )
  if (!filas.length) return <Text size="sm" c="dimmed">Sin cambios registrados para este equipo.</Text>
  return (
    <Table striped fz="sm" verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Fecha</Table.Th>
          <Table.Th>Usuario</Table.Th>
          <Table.Th>Antes</Table.Th>
          <Table.Th>Después</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filas.map((f, i) => (
          <Table.Tr key={i}>
            <Table.Td>{formatearFechaHora(f.fecha)}</Table.Td>
            <Table.Td>{f.responsable}</Table.Td>
            <Table.Td c="dimmed">{f.antes}</Table.Td>
            <Table.Td>{f.despues}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

/** Bitácora Específica del mes: los equipos del período (su fotografía del inventario) y su marca. */
function EspecificaDelMes({ p }: { p: PeriodoEndpoint }) {
  const equipos = useEquiposPeriodo(p.id, p.conDetalle)
  const [q, setQ] = useState<string | undefined>()
  const [marca, setMarca] = useState<Marca>('todos')
  const [historial, setHistorial] = useState<{ codigo: string; nombre: string } | null>(null)
  const texto = (q ?? '').toLowerCase()
  const filas = (equipos.data ?? [])
    .filter((e) => !texto || e.activo.codigo.toLowerCase().includes(texto) || e.activo.nombre.toLowerCase().includes(texto))
    .filter((e) => marca === 'todos' || (marca === 'con' ? e.conAntivirus === true : marca === 'sin' ? e.conAntivirus === false : e.conAntivirus === null))
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={5}>
          <Link to={`/proteccion-endpoints/${p.id}`}>{nombrePeriodo(p.anio, p.mes)}</Link>
        </Title>
        <BadgeEstadoPeriodo estado={p.estado} porEjecutar={p.porEjecutar} />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 4 }} mb="md">
        <Dato etiqueta="Fecha de medición">{p.fechaEjecucion ? formatearFechaHora(p.fechaEjecucion) : 'Sin medir'}</Dato>
        <Dato etiqueta="Responsable de la medición">{p.responsableEjecucion ?? '—'}</Dato>
        <Dato etiqueta="Evidencia (Excel)">{p.evidencia ?? '—'}</Dato>
        <Dato etiqueta="Repositorio"><EnlaceRepositorio valor={p.repositorioVerificable} /></Dato>
      </SimpleGrid>
      {!p.conDetalle ? (
        <Text size="sm" c="dimmed">Período anterior sin detalle por equipo: sus totales se registraron a mano.</Text>
      ) : equipos.error ? (
        <Alert color="red">{equipos.error.message}</Alert>
      ) : equipos.isPending ? (
        <Center py="sm"><Loader size="sm" /></Center>
      ) : (
        <Stack gap="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <CampoBusqueda label="Buscar equipo" placeholder="Código o nombre" valor={q} onCambio={setQ} />
            <SegmentedControl
              aria-label="Estado del antivirus"
              data={[
                { value: 'todos', label: `Todos (${equipos.data.length})` },
                { value: 'con', label: 'Con antivirus' },
                { value: 'sin', label: 'Sin antivirus' },
                { value: 'pendiente', label: 'Sin registrar' },
              ]}
              value={marca}
              onChange={(v) => setMarca(v as Marca)}
            />
          </Group>
          <Table.ScrollContainer minWidth={760}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código del equipo</Table.Th>
                  <Table.Th>Nombre del equipo</Table.Th>
                  <Table.Th>Categoría</Table.Th>
                  <Table.Th>Estado del antivirus</Table.Th>
                  <Table.Th>Historial</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((e) => (
                  <Table.Tr key={e.activoId}>
                    <Table.Td fw={500}>{e.activo.codigo}</Table.Td>
                    <Table.Td>{e.activo.nombre}</Table.Td>
                    <Table.Td>{e.activo.categoria}</Table.Td>
                    <Table.Td>
                      {e.conAntivirus === null ? (
                        <Badge variant="outline" color="gray">Sin registrar</Badge>
                      ) : e.conAntivirus ? (
                        <Badge variant="light" color="green">Con antivirus</Badge>
                      ) : (
                        <Badge variant="light" color="red">Sin antivirus</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => setHistorial({ codigo: e.activo.codigo, nombre: e.activo.nombre })}>
                        Ver
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!filas.length && <Text size="sm" c="dimmed">Ningún equipo coincide con los filtros.</Text>}
        </Stack>
      )}
      <Modal opened={historial !== null} onClose={() => setHistorial(null)} title={historial ? `Historial de ${historial.codigo} · ${historial.nombre}` : ''} size="lg">
        {historial && <HistorialEquipo periodoId={p.id} codigo={historial.codigo} />}
      </Modal>
    </Card>
  )
}

/**
 * Bitácora General MENSUAL del Excel (equipos con antivirus ÷ total activos, del período cerrado
 * de cada mes) y, al elegir un mes, su Bitácora Específica por equipo. Solo consulta.
 */
export function BitacoraMensual() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | undefined>()
  const general = useBitacoraGeneralEndpoints(anio)
  const periodo = usePeriodos({ page: 1, limit: 1, anio, mes, incluirAnulados: false })
  const p = mes ? periodo.data?.data.find((x) => x.anio === anio && x.mes === mes) : undefined
  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={(a) => { setAnio(a); setMes(undefined) }} />
      </Group>
      <BitacoraGeneral consulta={general} seleccionado={mes} onSeleccionar={setMes} />
      {mes && (
        <>
          <Title order={4}>Bitácora Específica · {nombrePeriodo(anio, mes)}</Title>
          {periodo.isPending ? (
            <Center py="sm"><Loader size="sm" /></Center>
          ) : p ? (
            <EspecificaDelMes key={p.id} p={p} />
          ) : (
            <Text size="sm" c="dimmed">Este mes no tiene período de Protección de Endpoints.</Text>
          )}
        </>
      )}
    </Stack>
  )
}
