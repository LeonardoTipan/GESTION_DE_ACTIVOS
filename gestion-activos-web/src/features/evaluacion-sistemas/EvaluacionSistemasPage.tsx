import { Alert, Anchor, Badge, Button, Center, Group, Loader, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { IconCalendarStats, IconPlus, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EncabezadoSeccion } from '../../shared/components/EncabezadoSeccion.tsx'
import { Cifra, PanelTablero } from '../../shared/components/Tablero.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { BadgeRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useActivos } from '../inventario/api/activos.ts'
import { useEvaluaciones, useProximasEvaluaciones, type EstadoEvaluacion } from './api.ts'
import { PlanificacionEvaluacionModal } from './PlanificacionEvaluacionModal.tsx'
import { DIAS_TABLERO, ESTADOS, INFO_ESTADO } from './textos.ts'

/** Cifras y paneles de la planificación (patrón de Planificación de Mantenimientos), con datos reales. */
function Tablero() {
  const proximas = useProximasEvaluaciones(DIAS_TABLERO)
  const vencidas = useEvaluaciones({ vencidas: true, page: 1, limit: 1 })
  const sistemas = useActivos({ operativos: true, aplica: 'EVALUACION', page: 1, limit: 20, sort: 'codigo', order: 'asc' })
  const error = proximas.error ?? vencidas.error ?? sistemas.error
  if (error) return <Alert color="red">{error.message}</Alert>
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
        <Cifra titulo={`Pasos a producción en ${DIAS_TABLERO} días`} valor={proximas.data?.meta.total} pista="Evaluaciones pendientes con fecha programada próxima" />
        <Cifra titulo="Sistemas elegibles" valor={sistemas.data?.meta.total} pista="Operativos de categorías con Evaluación" />
        <Cifra titulo="Evaluaciones vencidas" valor={vencidas.data?.meta.total} color="red" pista="Fecha programada ya pasada, sin cerrar" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <PanelTablero titulo={`Calendario · próximos ${DIAS_TABLERO} días`}>
          {!proximas.data ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : proximas.data.data.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay pasos a producción previstos.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={260} type="auto">
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {proximas.data.data.map((e) => (
                    <Table.Tr key={e.id}>
                      <Table.Td c={e.vencida ? 'red' : undefined} fw={e.vencida ? 600 : undefined} w={170}>
                        {formatearFechaHora(e.fechaProgramadaProduccion)}
                      </Table.Td>
                      <Table.Td>
                        {e.activo.codigo} · {e.activo.nombre}
                        <Text size="xs" c="dimmed">
                          {e.activo.categoria}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={INFO_ESTADO[e.estado].color}>
                          #{e.id} · {INFO_ESTADO[e.estado].etiqueta}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
        </PanelTablero>
        <PanelTablero titulo="Sistemas elegibles para evaluación">
          {sistemas.data && sistemas.data.data.length === 0 ? (
            <Text size="sm" c="dimmed">
              Ninguna categoría con activos está habilitada para Evaluación (Catálogos &gt; Categorías).
            </Text>
          ) : (
            <Stack gap={2}>
              {sistemas.data?.data.map((a) => (
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
              {sistemas.data && sistemas.data.meta.total > sistemas.data.data.length && (
                <Text size="xs" c="dimmed">
                  … y {sistemas.data.meta.total - sistemas.data.data.length} más.
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
 * Evaluación de Sistemas Productivos · fase 1 (planificación con la fecha programada de paso
 * a producción). La fase 2 (fecha real de las pruebas de seguridad e informe) aún no está.
 */
export function EvaluacionSistemasPage() {
  const puedeOperar = usePuedeOperar()
  const [filtros, setFiltros] = useState<{ page: number; q: string; estado?: EstadoEvaluacion; vencidas?: boolean }>({ page: 1, q: '' })
  const [q] = useDebouncedValue(filtros.q.trim(), 300)
  const consulta = useEvaluaciones({ page: filtros.page, limit: 20, q: q || undefined, estado: filtros.estado, vencidas: filtros.vencidas })
  const [modalAbierto, modal] = useDisclosure()
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.vencidas)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Evaluación de Sistemas Productivos</Title>
          <Text c="dimmed" size="sm">
            Pruebas de seguridad antes del paso a producción · fase 1: planificación
          </Text>
          <Text c="dimmed" size="xs">
            ISO/IEC 27001:2022 · A.8.29 Pruebas de seguridad en el desarrollo y la aceptación
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

      <Tablero />

      <EncabezadoSeccion
        titulo="Planificaciones de evaluación"
        accion={
          puedeOperar && (
            <Button leftSection={<IconPlus size={16} />} onClick={modal.open}>
              Nueva planificación
            </Button>
          )
        }
      />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar"
          placeholder="Sistema, descripción, asignado…"
          leftSection={<IconSearch size={14} />}
          value={filtros.q}
          onChange={(e) => cambiar({ q: e.currentTarget.value })}
          w={{ base: '100%', sm: 240 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as EstadoEvaluacion | null) ?? undefined })}
          w={{ base: '100%', sm: 160 }}
        />
        <Switch label="Solo vencidas" color="red" checked={filtros.vencidas ?? false} onChange={(e) => cambiar({ vencidas: e.currentTarget.checked || undefined })} mb={8} />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => setFiltros((f) => ({ ...f, page }))}
        tituloError="No se pudieron cargar las evaluaciones"
        vacio={
          <>
            <Text c="dimmed">{hayFiltros ? 'Ninguna evaluación coincide con los filtros.' : 'Todavía no hay evaluaciones planificadas.'}</Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={() => setFiltros({ page: 1, q: '' })}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(evaluaciones) => (
          <Table.ScrollContainer minWidth={1000}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N.º</Table.Th>
                  <Table.Th>Sistema</Table.Th>
                  <Table.Th>Paso a producción programado</Table.Th>
                  <Table.Th>Asignado</Table.Th>
                  <Table.Th>Descripción planificada</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Reg.</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {evaluaciones.map((e) => (
                  <Table.Tr key={e.id} style={{ opacity: e.anuladoEn ? 0.55 : 1 }}>
                    <Table.Td ff="monospace">#{e.id}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/activos/${e.activoId}`} size="sm" fw={600}>
                        {e.activo.codigo}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {e.activo.nombre} · {e.activo.categoria}
                      </Text>
                    </Table.Td>
                    <Table.Td c={e.vencida ? 'red' : undefined} fw={e.vencida ? 600 : undefined}>
                      {formatearFechaHora(e.fechaProgramadaProduccion)}
                      {e.vencida && (
                        <Badge size="xs" color="red" variant="light" ml={6}>
                          Vencida
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{e.responsable}</Table.Td>
                    <Table.Td maw={360}>
                      <Text size="sm" lineClamp={2}>
                        {e.descripcion}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={INFO_ESTADO[e.estado].color}>
                        {INFO_ESTADO[e.estado].etiqueta}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <BadgeRegistro registro={e} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>

      {puedeOperar && <PlanificacionEvaluacionModal opened={modalAbierto} onClose={modal.close} />}
    </Stack>
  )
}
