import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react'
import type { Dayjs } from 'dayjs'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCategoriasConActivos } from '../../features/inventario/api/activos.ts'
import {
  ASPECTO_ESTADO,
  diasDe,
  ESTADOS,
  marcasDelDia,
  moverAncla,
  NOMBRE_CAPA,
  NOMBRE_MODULO,
  rangoDe,
  textoRol,
  type Capa,
  type EstadoEvento,
  type EventoAgenda,
  type Marca,
  type Modulo,
  type Vista,
} from './agenda.ts'
import { useAgenda } from './api.ts'

import { enZona } from '../zona.ts'
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const MAX_POR_CELDA = 3

interface Props {
  titulo: string
  /** Qué muestra este calendario (una frase). */
  descripcion?: string
  modulos: Modulo[]
  /** Fija la capa; sin ella (vista general) se elige en el propio calendario. */
  capa?: Capa
  /** Crear una actividad PREVISTA desde un día (si el usuario puede). */
  onCrear?: (dia: Dayjs) => void
  textoCrear?: string
  /** Acciones extra en el detalle de un evento (según el rol). */
  accionesEvento?: (evento: EventoAgenda) => ReactNode
}

/**
 * Calendario de agenda (mes, semana, día) sobre los eventos que la API
 * calcula de lo guardado. Lo PREVISTO va con borde discontinuo; lo REAL,
 * relleno. Un intervalo previsto aparece en su inicio y en su límite.
 */
export function Calendario({ titulo, descripcion, modulos, capa, onCrear, textoCrear = 'Programar', accionesEvento }: Props) {
  const movil = useMediaQuery('(max-width: 48em)')
  const [vista, setVista] = useState<Vista>('mes')
  const [ancla, setAncla] = useState(() => enZona())
  const [capaElegida, setCapaElegida] = useState<Capa | undefined>(capa)
  const [categoriaId, setCategoriaId] = useState<number | undefined>()
  const [estado, setEstado] = useState<EstadoEvento | undefined>()
  const [responsable, setResponsable] = useState('')
  const [responsableEstable] = useDebouncedValue(responsable.trim(), 400)
  const [elegido, setElegido] = useState<EventoAgenda | null>(null)
  const categorias = useCategoriasConActivos({ operativos: false })

  const { desde, hasta } = rangoDe(vista, ancla)
  const agenda = useAgenda(modulos, {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    capa: capa ?? capaElegida,
    categoriaId,
    estado,
    responsable: responsableEstable || undefined,
  })
  const eventos = agenda.data ?? []
  const titulo2 = vista === 'mes' ? ancla.format('MMMM YYYY') : vista === 'semana' ? `${desde.format('D MMM')} – ${hasta.format('D MMM YYYY')}` : ancla.format('dddd D [de] MMMM YYYY')
  const verDia = (d: Dayjs) => {
    setAncla(d)
    setVista('dia')
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={4}>{titulo}</Title>
            {descripcion && (
              <Text size="sm" c="dimmed">
                {descripcion}
              </Text>
            )}
          </div>
          <Group gap="xs" wrap="wrap">
            <ActionIcon variant="default" aria-label="Período anterior" onClick={() => setAncla(moverAncla(vista, ancla, -1))}>
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Button size="xs" variant="default" onClick={() => setAncla(enZona())}>
              Hoy
            </Button>
            <ActionIcon variant="default" aria-label="Período siguiente" onClick={() => setAncla(moverAncla(vista, ancla, 1))}>
              <IconChevronRight size={16} />
            </ActionIcon>
            <Text fw={600} tt="capitalize" miw={150}>
              {titulo2}
            </Text>
            <SegmentedControl
              size="xs"
              value={vista}
              onChange={(v) => setVista(v as Vista)}
              data={[
                { value: 'mes', label: 'Mes' },
                { value: 'semana', label: 'Semana' },
                { value: 'dia', label: 'Día' },
              ]}
            />
          </Group>
        </Group>

        <Group gap="sm" align="flex-end" wrap="wrap">
          {!capa && (
            <Select
              size="xs"
              label="Etapa"
              placeholder="Las tres"
              clearable
              data={[
                { value: '1', label: '1 · Planificación' },
                { value: '2', label: '2 · Ejecución o tratamiento' },
                { value: '3', label: '3 · Verificación o restauración' },
              ]}
              value={capaElegida ? String(capaElegida) : null}
              onChange={(v) => setCapaElegida(v ? (Number(v) as Capa) : undefined)}
              w={{ base: '100%', sm: 210 }}
            />
          )}
          <Select
            size="xs"
            label="Categoría del activo"
            placeholder="Todas las categorías"
            clearable
            searchable
            data={(categorias.data ?? []).map((c) => ({ value: String(c.categoriaId), label: c.nombre }))}
            value={categoriaId ? String(categoriaId) : null}
            onChange={(v) => setCategoriaId(v ? Number(v) : undefined)}
            w={{ base: '100%', sm: 200 }}
          />
          <TextInput
            size="xs"
            label="Responsable"
            placeholder="Nombre o usuario"
            leftSection={<IconSearch size={14} />}
            value={responsable}
            onChange={(e) => setResponsable(e.currentTarget.value)}
            w={{ base: '100%', sm: 180 }}
          />
          <Select
            size="xs"
            label="Estado"
            placeholder="Todos"
            clearable
            data={ESTADOS.map((e) => ({ value: e, label: ASPECTO_ESTADO[e].etiqueta }))}
            value={estado ?? null}
            onChange={(v) => setEstado((v as EstadoEvento | null) ?? undefined)}
            w={{ base: '100%', sm: 190 }}
          />
          {agenda.isFetching && <Loader size="xs" mb={8} />}
        </Group>

        <Leyenda />

        {agenda.error && <Alert color="red">{agenda.error.message}</Alert>}
        {!agenda.isPending && eventos.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="xs">
            No hay eventos en este período con los filtros aplicados.
          </Text>
        )}

        {vista === 'mes' && !movil ? (
          <Mes ancla={ancla} desde={desde} hasta={hasta} eventos={eventos} onEvento={setElegido} onDia={verDia} onCrear={onCrear} textoCrear={textoCrear} />
        ) : vista === 'dia' ? (
          <ListaDia dia={ancla} eventos={eventos} onEvento={setElegido} onCrear={onCrear} textoCrear={textoCrear} />
        ) : (
          <Semana desde={desde} hasta={hasta} eventos={eventos} onEvento={setElegido} onDia={verDia} movil={!!movil} />
        )}
      </Stack>

      <Drawer opened={elegido !== null} onClose={() => setElegido(null)} position="right" title="Detalle del evento" size="md">
        {elegido && <DetalleEvento evento={elegido} acciones={accionesEvento?.(elegido)} />}
      </Drawer>
    </Card>
  )
}

function Leyenda() {
  return (
    <Group gap="xs" wrap="wrap">
      <Badge variant="outline" color="gray" style={{ borderStyle: 'dashed' }}>
        Previsto
      </Badge>
      <Badge variant="filled" color="gray">
        Real
      </Badge>
      {ESTADOS.map((e) => (
        <Badge key={e} size="sm" variant="light" color={ASPECTO_ESTADO[e].color}>
          {ASPECTO_ESTADO[e].etiqueta}
        </Badge>
      ))}
      <Badge size="sm" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
        Fuera de plazo
      </Badge>
    </Group>
  )
}

/** Un evento en una celda: discontinuo si es previsto, relleno si es real. */
function Chip({ marca, onClick }: { marca: Marca; onClick: () => void }) {
  const { evento, rol } = marca
  const { color } = ASPECTO_ESTADO[evento.estado]
  const previsto = evento.tipo === 'PREVISTO'
  return (
    <Tooltip label={`${textoRol(evento, rol)} · ${evento.titulo} · ${ASPECTO_ESTADO[evento.estado].etiqueta}`} withinPortal multiline maw={320}>
      <UnstyledButton
        onClick={onClick}
        w="100%"
        px={6}
        py={2}
        style={{
          borderRadius: 6,
          border: `1px ${previsto ? 'dashed' : 'solid'} var(--mantine-color-${color}-6)`,
          background: previsto ? 'transparent' : `var(--mantine-color-${color}-light)`,
          overflow: 'hidden',
        }}
      >
        <Text size="xs" lineClamp={1} c={`${color}.8`}>
          {evento.fueraDePlazo && '⚠ '}
          {rol === 'limite' ? 'Límite · ' : rol === 'inicio' ? '▶ ' : ''}
          {marca.hora.format('HH:mm')} {evento.titulo}
        </Text>
      </UnstyledButton>
    </Tooltip>
  )
}

function Mes({
  ancla, desde, hasta, eventos, onEvento, onDia, onCrear, textoCrear,
}: {
  ancla: Dayjs; desde: Dayjs; hasta: Dayjs; eventos: EventoAgenda[]; onEvento: (e: EventoAgenda) => void; onDia: (d: Dayjs) => void; onCrear?: (d: Dayjs) => void; textoCrear: string
}) {
  const hoy = enZona()
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, overflow: 'hidden' }}>
      {DIAS.map((d) => (
        <Text key={d} size="xs" fw={600} ta="center" py={4} c="dimmed" tt="uppercase" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {d}
        </Text>
      ))}
      {diasDe(desde, hasta).map((dia) => {
        const marcas = marcasDelDia(eventos, dia)
        const fuera = dia.month() !== ancla.month()
        return (
          <Box key={dia.format('YYYY-MM-DD')} p={4} mih={104} style={{ borderTop: '1px solid var(--mantine-color-default-border)', borderLeft: dia.day() === 1 ? undefined : '1px solid var(--mantine-color-default-border)', opacity: fuera ? 0.55 : 1 }}>
            <Group justify="space-between" gap={2} mb={2}>
              <UnstyledButton onClick={() => onDia(dia)} aria-label={`Ver el ${dia.format('D [de] MMMM')}`}>
                <Text size="xs" fw={dia.isSame(hoy, 'day') ? 800 : 500} c={dia.isSame(hoy, 'day') ? 'blue' : undefined}>
                  {dia.date()}
                </Text>
              </UnstyledButton>
              {onCrear && (
                <Tooltip label={`${textoCrear} el ${dia.format('D [de] MMMM')}`} withinPortal>
                  <ActionIcon size="xs" variant="subtle" aria-label={`${textoCrear} el ${dia.format('D [de] MMMM')}`} onClick={() => onCrear(dia)}>
                    <IconPlus size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <Stack gap={2}>
              {marcas.slice(0, MAX_POR_CELDA).map((m) => (
                <Chip key={`${m.evento.clave}-${m.rol}`} marca={m} onClick={() => onEvento(m.evento)} />
              ))}
              {marcas.length > MAX_POR_CELDA && (
                <Anchor size="xs" component="button" onClick={() => onDia(dia)}>
                  +{marcas.length - MAX_POR_CELDA} más
                </Anchor>
              )}
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}

/** Semana (y el mes en pantallas pequeñas): un bloque por día con sus eventos. */
function Semana({ desde, hasta, eventos, onEvento, onDia, movil }: { desde: Dayjs; hasta: Dayjs; eventos: EventoAgenda[]; onEvento: (e: EventoAgenda) => void; onDia: (d: Dayjs) => void; movil: boolean }) {
  const dias = diasDe(desde, hasta).filter((d) => !movil || marcasDelDia(eventos, d).length > 0)
  return (
    <SimpleGrid cols={{ base: 1, md: movil ? 1 : 7 }} spacing={6}>
      {dias.map((dia) => (
        <Box key={dia.format('YYYY-MM-DD')} p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
          <UnstyledButton onClick={() => onDia(dia)}>
            <Text size="xs" fw={700} tt="capitalize" c={dia.isSame(enZona(), 'day') ? 'blue' : undefined}>
              {dia.format('ddd D MMM')}
            </Text>
          </UnstyledButton>
          <Stack gap={3} mt={4}>
            {marcasDelDia(eventos, dia).map((m) => (
              <Chip key={`${m.evento.clave}-${m.rol}`} marca={m} onClick={() => onEvento(m.evento)} />
            ))}
          </Stack>
        </Box>
      ))}
    </SimpleGrid>
  )
}

function ListaDia({ dia, eventos, onEvento, onCrear, textoCrear }: { dia: Dayjs; eventos: EventoAgenda[]; onEvento: (e: EventoAgenda) => void; onCrear?: (d: Dayjs) => void; textoCrear: string }) {
  const marcas = marcasDelDia(eventos, dia, true)
  return (
    <Stack gap={6}>
      {onCrear && (
        <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => onCrear(dia)} w="fit-content">
          {textoCrear} el {dia.format('D [de] MMMM')}
        </Button>
      )}
      {marcas.length === 0 && (
        <Text size="sm" c="dimmed">
          Sin eventos este día.
        </Text>
      )}
      {marcas.map((m) => (
        <UnstyledButton key={`${m.evento.clave}-${m.rol}`} onClick={() => onEvento(m.evento)}>
          <Group gap="sm" wrap="nowrap" align="flex-start" p={6} style={{ border: `1px ${m.evento.tipo === 'PREVISTO' ? 'dashed' : 'solid'} var(--mantine-color-${ASPECTO_ESTADO[m.evento.estado].color}-6)`, borderRadius: 8 }}>
            <Text size="sm" fw={600} w={56}>
              {m.rol === 'continua' ? '—' : m.hora.format('HH:mm')}
            </Text>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={500}>
                {m.evento.titulo}
              </Text>
              <Text size="xs" c="dimmed">
                {textoRol(m.evento, m.rol)} · {NOMBRE_MODULO[m.evento.modulo]} · {NOMBRE_CAPA[m.evento.modulo][m.evento.capa]} · {m.evento.activo.codigo} ({m.evento.activo.categoria})
              </Text>
            </div>
            <Badge size="sm" variant="light" color={ASPECTO_ESTADO[m.evento.estado].color}>
              {ASPECTO_ESTADO[m.evento.estado].etiqueta}
            </Badge>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  )
}

function DetalleEvento({ evento: e, acciones }: { evento: EventoAgenda; acciones?: ReactNode }) {
  const previsto = e.tipo === 'PREVISTO'
  const f = (s: string | null) => (s ? enZona(s).format('dddd D [de] MMMM YYYY, HH:mm') : '—')
  return (
    <Stack gap="sm">
      <Text fw={600}>{e.titulo}</Text>
      <Group gap={6}>
        <Badge variant={previsto ? 'outline' : 'filled'} color="gray" style={previsto ? { borderStyle: 'dashed' } : undefined}>
          {previsto ? 'Previsto' : 'Real'}
        </Badge>
        <Badge variant="light" color={ASPECTO_ESTADO[e.estado].color}>
          {ASPECTO_ESTADO[e.estado].etiqueta}
        </Badge>
        <Badge variant="light" color="gray">
          {NOMBRE_MODULO[e.modulo]} · {NOMBRE_CAPA[e.modulo][e.capa]}
        </Badge>
      </Group>
      {e.fueraDePlazo && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Registrado fuera de plazo">
          Se registró como excepción justificada por un administrador. Las fechas reales se conservan.
        </Alert>
      )}
      <Dato etiqueta={previsto ? 'Inicio previsto' : 'Fecha real'}>{f(e.inicio)}</Dato>
      {(e.fin || previsto) && <Dato etiqueta={previsto ? 'Límite' : 'Fin real'}>{f(e.fin)}</Dato>}
      <Dato etiqueta="Activo">
        <Anchor component={Link} to={`/activos/${e.activo.id}`}>
          {e.activo.codigo} · {e.activo.nombre}
        </Anchor>{' '}
        <Text span size="xs" c="dimmed">
          ({e.activo.categoria})
        </Text>
      </Dato>
      <Dato etiqueta="Responsable">{e.responsable ?? '—'}</Dato>
      {e.detalle && <Dato etiqueta="Detalle">{e.detalle}</Dato>}
      <Group gap="xs" mt="sm">
        <Button component={Link} to={e.ruta} size="xs">
          Abrir registro
        </Button>
        {acciones}
      </Group>
    </Stack>
  )
}
