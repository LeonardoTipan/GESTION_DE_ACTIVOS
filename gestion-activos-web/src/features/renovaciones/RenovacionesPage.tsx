import { Anchor, Button, Card, Group, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { IconCalendarEvent, IconChecklist, IconPlus, IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFecha } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { BadgeRegistro } from '../../shared/registro/componentes.tsx'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import { useCaducidades, useRenovaciones, useResumenVigencias, type EstadoRenovacion, type Renovacion, type TipoRenovacion, type Vigencia } from './api.ts'
import { BadgeEstado, BadgeVigencia } from './componentes.tsx'
import { aConsultaApi, escribirFiltros, leerFiltros, type Fase } from './filtros-url.ts'
import { PlanificacionModal } from './PlanificacionModal.tsx'
import { ESTADOS, INFO_ESTADO, INFO_TIPO, INFO_VIGENCIA, textoDias, TIPOS, VIGENCIAS } from './textos.ts'

/** Fecha o «—»; «Sin caducidad» cuando así se marcó. */
const fechaO = (f: string | null, sin = false) => (sin ? 'Sin caducidad' : f ? formatearFecha(f) : '—')

function TablaRenovaciones({ renovaciones }: { renovaciones: Renovacion[] }) {
  const navigate = useNavigate()
  const categorias = useCategorias()
  const claseDe = (categoriaId: number) => categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null
  return (
    <Table.ScrollContainer minWidth={1350}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Sistema</Table.Th>
            <Table.Th>Tipo de renovación</Table.Th>
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Fecha planificada</Table.Th>
            <Table.Th>Caducidad actual</Table.Th>
            <Table.Th>Fecha real de renovación</Table.Th>
            <Table.Th>Nueva caducidad</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Vigencia</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {renovaciones.map((r) => (
            <Table.Tr key={r.id} style={{ cursor: 'pointer', opacity: r.anuladoEn ? 0.55 : 1 }} onClick={() => navigate(`/renovaciones/${r.id}`)}>
              <Table.Td>
                <Anchor component={Link} to={`/renovaciones/${r.id}`} fw={600} onClick={(e) => e.stopPropagation()}>
                  #{r.id}
                </Anchor>
                <BadgeRegistro registro={r} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {r.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed" maw={200}>
                  {r.activo.nombre}
                </Text>
                <BadgeClase clase={claseDe(r.activo.categoriaId)} size="xs" />
              </Table.Td>
              <Table.Td>{INFO_TIPO[r.tipo]}</Table.Td>
              <Table.Td>{r.responsable}</Table.Td>
              <Table.Td>{formatearFecha(r.fechaPlanificada)}</Table.Td>
              <Table.Td>{fechaO(r.fechaCaducidadActual, r.sinCaducidadActual)}</Table.Td>
              <Table.Td>{r.fechaRenovacion ? formatearFecha(r.fechaRenovacion) : <Text size="sm" c="dimmed">No renovada</Text>}</Table.Td>
              <Table.Td>{fechaO(r.nuevaFechaCaducidad, r.nuevaSinCaducidad)}</Table.Td>
              <Table.Td>
                <BadgeEstado estado={r.estado} />
              </Table.Td>
              <Table.Td>
                <BadgeVigencia r={r} />
                {r.diasRestantes !== null && r.vigencia !== 'VIGENTE' && (
                  <Text size="xs" c="dimmed">
                    {textoDias(r.diasRestantes)}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" component={Link} to={`/renovaciones/${r.id}?fase=${r.estado === 'ABIERTO' ? 'planificacion' : 'ejecucion'}`} onClick={(e) => e.stopPropagation()}>
                  {r.estado === 'CERRADO' ? 'Ver' : r.estado === 'ABIERTO' ? 'Abrir' : 'Ejecutar'}
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/** Cifras de vigencia: cada una filtra el listado por esa vigencia. */
function ResumenVigencias({ activa, onElegir }: { activa?: Vigencia; onElegir: (v: Vigencia | undefined) => void }) {
  const { data } = useResumenVigencias()
  const cifras: { v: Vigencia; valor?: number; pista: string }[] = [
    { v: 'CADUCADA', valor: data?.caducadas, pista: 'Ya pasó su caducidad' },
    { v: 'PROXIMA', valor: data?.proximas, pista: `Caducan en ${data?.diasAviso ?? 30} días o menos` },
    { v: 'VIGENTE', valor: data?.vigentes, pista: 'Con margen' },
    { v: 'SIN_CADUCIDAD', valor: data?.sinCaducidad, pista: 'Sin fecha conocida o aplicable' },
  ]
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }}>
      {cifras.map(({ v, valor, pista }) => (
        <UnstyledButton key={v} onClick={() => onElegir(activa === v ? undefined : v)} aria-pressed={activa === v}>
          <Card withBorder padding="sm" style={{ borderColor: activa === v ? `var(--mantine-color-${INFO_VIGENCIA[v].color}-6)` : undefined }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {INFO_VIGENCIA[v].etiqueta}
            </Text>
            <Text fz={28} fw={700} c={valor ? INFO_VIGENCIA[v].color : undefined}>
              {valor ?? '—'}
            </Text>
            <Text size="xs" c="dimmed">
              {pista}
            </Text>
          </Card>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  )
}

/** Próximas caducidades: lo caducado y lo que caduca pronto (de lo que rige hoy). */
function ProximasCaducidades() {
  const { data } = useCaducidades()
  if (!data || data.length === 0) return null
  return (
    <Card withBorder padding="sm">
      <Title order={5} mb="xs">
        Próximas caducidades
      </Title>
      <Stack gap={4}>
        {data.slice(0, 8).map((r) => (
          <Group key={r.id} gap="xs" wrap="nowrap">
            <BadgeVigencia r={r} />
            <Anchor component={Link} to={`/renovaciones/${r.id}`} size="sm">
              {INFO_TIPO[r.tipo]} · {r.activo.codigo} {r.activo.nombre}
            </Anchor>
            <Text size="xs" c="dimmed">
              {formatearFecha(r.venceEl)} · {textoDias(r.diasRestantes)} · {INFO_ESTADO[r.estado].etiqueta.toLowerCase()}
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}

/** Texto libre con espera: no consulta la API en cada tecla. */
function CampoTexto({ valor, onCambio, ...props }: { valor?: string; onCambio: (v: string | undefined) => void; label: string; placeholder: string; w?: object }) {
  const [texto, setTexto] = useState(valor ?? '')
  const [estable] = useDebouncedValue(texto, 400)
  useEffect(() => {
    if ((estable.trim() || undefined) !== valor) onCambio(estable.trim() || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo tecleado
  }, [estable])
  return <TextInput leftSection={<IconSearch size={14} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} {...props} />
}

/**
 * Renovaciones en DOS fases sobre el mismo registro:
 *   1 · Planificación: todo el registro y el alta de nuevas.
 *   2 · Ejecución y cierre: lo pendiente de renovar (o el estado elegido).
 */
export function RenovacionesPage() {
  const navigate = useNavigate()
  const { filtros, actualizar, limpiar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const fase: Fase = filtros.fase ?? 'planificacion'
  const consulta = useRenovaciones(aConsultaApi(filtros))
  const puedeOperar = usePuedeOperar()
  const [modalAbierto, modal] = useDisclosure()
  const hayFiltros = Object.entries(filtros).some(([k, v]) => k !== 'page' && k !== 'fase' && v !== undefined)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Renovaciones</Title>
          <Text c="dimmed" size="sm">
            Dos fases: planificación → ejecución y cierre · licencias, garantías, certificados y contratos
          </Text>
          <Text c="dimmed" size="xs">
            La vigencia del elemento (vigente, próximo a caducar, caducado) es distinta del estado del proceso.
          </Text>
        </div>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Planificar renovación
          </Button>
        )}
      </Group>

      <ResumenVigencias activa={filtros.vigencia} onElegir={(vigencia) => actualizar({ vigencia, page: 1 })} />
      <ProximasCaducidades />

      <Tabs value={fase} onChange={(v) => actualizar({ fase: v === 'ejecucion' ? 'ejecucion' : undefined, estado: undefined, page: 1 })}>
        <Tabs.List>
          <Tabs.Tab value="planificacion" leftSection={<IconCalendarEvent size={16} />}>
            1 · Planificación
          </Tabs.Tab>
          <Tabs.Tab value="ejecucion" leftSection={<IconChecklist size={16} />}>
            2 · Ejecución y cierre
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Text size="sm" c="dimmed">
        {fase === 'planificacion'
          ? 'Todas las renovaciones planificadas, en cualquier estado. Abra una para corregir su planificación o pasar a la ejecución.'
          : 'Lo pendiente de renovar (abierto o en progreso). Abra una para registrar la fecha real, la nueva caducidad y la evidencia, y cerrarla.'}
      </Text>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <CampoTexto label="Buscar" placeholder="Sistema, descripción o verificable" valor={filtros.q} onCambio={(q) => actualizar({ q, page: 1 })} w={{ base: '100%', sm: 220 }} />
        <SelectorActivo label="Sistema" placeholder="Todos" value={filtros.activoId ?? null} onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })} w={{ base: '100%', sm: 250 }} />
        <CampoTexto label="Responsable" placeholder="ANALISTA 1" valor={filtros.responsable} onCambio={(responsable) => actualizar({ responsable, page: 1 })} w={{ base: '100%', sm: 160 }} />
        <Select
          label="Tipo"
          placeholder="Todos"
          clearable
          data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t] }))}
          value={filtros.tipo ?? null}
          onChange={(v) => actualizar({ tipo: (v as TipoRenovacion | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 170 }}
        />
        <Select
          label="Estado del proceso"
          placeholder={fase === 'ejecucion' ? 'Pendientes' : 'Todos'}
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => actualizar({ estado: (v as EstadoRenovacion | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Vigencia"
          placeholder="Todas"
          clearable
          data={VIGENCIAS.map((v) => ({ value: v, label: INFO_VIGENCIA[v].etiqueta }))}
          value={filtros.vigencia ?? null}
          onChange={(v) => actualizar({ vigencia: (v as Vigencia | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 170 }}
        />
        <DatePickerInput
          type="range"
          label="Caduca entre"
          placeholder="Rango de días"
          clearable
          valueFormat="DD MMM YYYY"
          value={[filtros.caducaDesde ?? null, filtros.caducaHasta ?? null]}
          onChange={([desde, hasta]) => {
            if ((desde && hasta) || (!desde && !hasta)) actualizar({ caducaDesde: desde ?? undefined, caducaHasta: hasta ?? undefined, page: 1 })
          }}
          w={{ base: '100%', sm: 240 }}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudieron cargar las renovaciones"
        vacio={
          <>
            <Text c="dimmed">
              {hayFiltros ? 'Ninguna renovación coincide con los filtros.' : fase === 'ejecucion' ? 'No hay renovaciones pendientes.' : 'Todavía no hay renovaciones planificadas.'}
            </Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={limpiar}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(renovaciones) => <TablaRenovaciones renovaciones={renovaciones} />}
      </TarjetaListado>

      {puedeOperar && <PlanificacionModal opened={modalAbierto} onClose={modal.close} onGuardada={(r) => navigate(`/renovaciones/${r.id}`)} />}
    </Stack>
  )
}
