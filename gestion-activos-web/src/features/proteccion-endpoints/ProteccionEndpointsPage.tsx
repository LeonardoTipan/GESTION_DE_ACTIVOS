import { Alert, Anchor, Badge, Button, Center, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Tabs, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconCalendarStats, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EncabezadoSeccion } from '../../shared/components/EncabezadoSeccion.tsx'
import { Cifra, PanelTablero } from '../../shared/components/Tablero.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { BadgeRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useActivos } from '../inventario/api/activos.ts'
import { usePeriodos, type EstadoPeriodo } from './api.ts'
import { PlanificacionPeriodoModal } from './PlanificacionPeriodoModal.tsx'
import { ESTADOS, INFO_ESTADO, MESES, mesesDelAnio, mesesSinAbrir, nombrePeriodo, type SituacionMes } from './textos.ts'

const SITUACION: Record<Exclude<SituacionMes, EstadoPeriodo>, { etiqueta: string; color: string }> = {
  SIN_ABRIR: { etiqueta: 'Sin abrir', color: 'red' },
  FUTURO: { etiqueta: '—', color: 'gray' },
}
const infoSituacion = (s: SituacionMes) => (s === 'SIN_ABRIR' || s === 'FUTURO' ? SITUACION[s] : INFO_ESTADO[s])

/** Cifras y paneles de la planificación (patrón de Planificación de Mantenimientos), con datos reales. */
function Tablero({ hoy }: { hoy: { anio: number; mes: number } }) {
  const delAnio = usePeriodos({ anio: hoy.anio, page: 1, limit: 12 })
  const abiertos = usePeriodos({ estado: 'ABIERTO', page: 1, limit: 1 })
  const enProgreso = usePeriodos({ estado: 'EN_PROGRESO', page: 1, limit: 1 })
  const equipos = useActivos({ operativos: true, aplica: 'ENDPOINT', page: 1, limit: 20, sort: 'codigo', order: 'asc' })
  const error = delAnio.error ?? abiertos.error ?? enProgreso.error ?? equipos.error
  if (error) return <Alert color="red">{error.message}</Alert>
  const meses = delAnio.data ? mesesDelAnio(delAnio.data.data, hoy.anio, hoy) : undefined
  const pendientes = abiertos.data && enProgreso.data ? abiertos.data.meta.total + enProgreso.data.meta.total : undefined
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
        <Cifra titulo="Equipos sujetos a control" valor={equipos.data?.meta.total} pista="Operativos de categorías con Protección de endpoints" />
        <Cifra titulo="Períodos abiertos" valor={pendientes} color="orange" pista="Abiertos o en progreso, sin cerrar" />
        <Cifra titulo={`Meses sin período · ${hoy.anio}`} valor={meses ? mesesSinAbrir(meses) : undefined} color="red" pista="Meses ya transcurridos sin abrir" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <PanelTablero titulo={`Calendario · ${hoy.anio}`}>
          {!meses ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : (
            <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
              {meses.map(({ mes, situacion }) => {
                const info = infoSituacion(situacion)
                return (
                  <Paper key={mes} withBorder p={6} radius="sm">
                    <Text size="xs" fw={600}>
                      {MESES[mes - 1]}
                    </Text>
                    <Badge size="xs" variant={situacion === 'FUTURO' ? 'outline' : 'light'} color={info.color}>
                      {info.etiqueta}
                    </Badge>
                  </Paper>
                )
              })}
            </SimpleGrid>
          )}
        </PanelTablero>
        <PanelTablero titulo="Equipos sujetos a control">
          {equipos.data && equipos.data.data.length === 0 ? (
            <Text size="sm" c="dimmed">
              Ninguna categoría está habilitada para Protección de endpoints (Catálogos &gt; Categorías).
            </Text>
          ) : (
            <Stack gap={2}>
              {equipos.data?.data.map((a) => (
                <Text size="sm" key={a.id}>
                  <Anchor component={Link} to={`/activos/${a.id}`}>
                    {a.codigo}
                  </Anchor>{' '}
                  · {a.nombre}{' '}
                  <Text span size="xs" c="dimmed">
                    ({a.categoria.nombre})
                  </Text>
                </Text>
              ))}
              {equipos.data && equipos.data.meta.total > equipos.data.data.length && (
                <Text size="xs" c="dimmed">
                  … y {equipos.data.meta.total - equipos.data.data.length} más.
                </Text>
              )}
            </Stack>
          )}
        </PanelTablero>
      </SimpleGrid>
    </Stack>
  )
}

/**
 * Protección de Endpoints · fase 1 (planificación: apertura del período mensual). La fase 2
 * (total de activos, equipos con antivirus y el Excel del inventario) aún no está disponible.
 */
export function ProteccionEndpointsPage() {
  const puedeOperar = usePuedeOperar()
  const [anioHoy, mesHoy] = hoyLocal().split('-').map(Number)
  const hoy = { anio: anioHoy, mes: mesHoy }
  const [filtros, setFiltros] = useState<{ page: number; anio?: number; mes?: number; estado?: EstadoPeriodo }>({ page: 1 })
  const consulta = usePeriodos({ page: filtros.page, limit: 20, anio: filtros.anio, mes: filtros.mes, estado: filtros.estado })
  const [modalAbierto, modal] = useDisclosure()
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))
  const hayFiltros = filtros.anio !== undefined || filtros.mes !== undefined || filtros.estado !== undefined

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Protección de Endpoints</Title>
          <Text c="dimmed" size="sm">
            Medición mensual de la cobertura de antivirus/EDR · fase 1: apertura del período
          </Text>
          <Text c="dimmed" size="xs">
            ISO/IEC 27001:2022 · A.8.7 Protección contra el malware
          </Text>
        </div>
      </Group>

      <Tabs value="planificacion">
        <Tabs.List>
          <Tabs.Tab value="planificacion" leftSection={<IconCalendarStats size={16} />}>
            1 · Planificación
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Tablero hoy={hoy} />

      <EncabezadoSeccion
        titulo="Períodos mensuales"
        accion={
          puedeOperar && (
            <Button leftSection={<IconPlus size={16} />} onClick={modal.open}>
              Nueva planificación
            </Button>
          )
        }
      />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Año"
          placeholder="Todos"
          clearable
          data={Array.from({ length: 6 }, (_, i) => String(hoy.anio - i))}
          value={filtros.anio ? String(filtros.anio) : null}
          onChange={(v) => cambiar({ anio: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 130 }}
        />
        <Select
          label="Mes"
          placeholder="Todos"
          clearable
          data={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
          value={filtros.mes ? String(filtros.mes) : null}
          onChange={(v) => cambiar({ mes: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as EstadoPeriodo | null) ?? undefined })}
          w={{ base: '100%', sm: 160 }}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => setFiltros((f) => ({ ...f, page }))}
        tituloError="No se pudieron cargar los períodos"
        vacio={
          <>
            <Text c="dimmed">{hayFiltros ? 'Ningún período coincide con los filtros.' : 'Todavía no hay períodos abiertos.'}</Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={() => setFiltros({ page: 1 })}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(periodos) => (
          <Table.ScrollContainer minWidth={1100}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Período</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Asignado</Table.Th>
                  <Table.Th>Cobertura</Table.Th>
                  <Table.Th>Medición real</Table.Th>
                  <Table.Th>Observación</Table.Th>
                  <Table.Th>Abierto el</Table.Th>
                  <Table.Th>Reg.</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {periodos.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/proteccion-endpoints/${p.id}`} fw={600} size="sm">
                        {nombrePeriodo(p.anio, p.mes)}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={INFO_ESTADO[p.estado].color}>
                        {INFO_ESTADO[p.estado].etiqueta}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{p.responsable}</Table.Td>
                    <Table.Td>
                      {p.cobertura === null ? '—' : (
                        <Badge variant="light" color={p.cobertura >= 95 ? 'green' : p.cobertura >= 80 ? 'yellow' : 'red'}>
                          {p.cobertura} % · {p.equiposConAntivirus}/{p.totalActivos}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{p.fechaEjecucion ? formatearFechaHora(p.fechaEjecucion) : '—'}</Table.Td>
                    <Table.Td maw={320}>
                      <Text size="sm" lineClamp={2}>
                        {p.observacion ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{formatearFechaHora(p.createdAt)}</Table.Td>
                    <Table.Td>
                      <BadgeRegistro registro={p} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>

      {puedeOperar && <PlanificacionPeriodoModal opened={modalAbierto} onClose={modal.close} hoy={hoy} />}
    </Stack>
  )
}
