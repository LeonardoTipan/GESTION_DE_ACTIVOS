import { Anchor, Badge, Button, Group, Select, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconCalendarStats, IconChecklist, IconNotebook, IconPlus, IconSearch, IconTool } from '@tabler/icons-react'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Calendario } from '../../shared/calendario/Calendario.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { BadgeRegistro, FranjaIndicadores, SelectorPeriodo } from '../../shared/registro/componentes.tsx'
import { periodoPorId } from '../../shared/registro/registro.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import {
  useMantenimientos,
  type Fase,
  type Mantenimiento,
  type TipoMantenimiento,
  useIndicadoresMantenimiento,
} from './api/mantenimientos.ts'
import { BadgeCierre, BadgeEstadoEquipo, BadgeFase, BadgeTipo, BadgeVencido } from './componentes/Badges.tsx'
import { Bitacoras } from './componentes/Bitacoras.tsx'
import { Planificacion } from './componentes/Planificacion.tsx'
import { ProgramarModal } from './componentes/ProgramarModal.tsx'
import { FASES, INFO_CIERRE, INFO_FASE, INFO_TIPO, TIPOS } from './fases.ts'
import { aConsultaApi, CIERRES, escribirFiltros, leerFiltros, type Capa, type FiltroCierre } from './filtros-url.ts'

function TablaMantenimientos({ mantenimientos, capa }: { mantenimientos: Mantenimiento[]; capa: Capa }) {
  const navigate = useNavigate()
  const verificacion = capa === 'verificacion'
  return (
    <Table.ScrollContainer minWidth={1000}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Activo</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Descripción prevista</Table.Th>
            <Table.Th>{verificacion ? 'Completado' : 'Inicio previsto'}</Table.Th>
            <Table.Th>Encargado</Table.Th>
            <Table.Th>Situación</Table.Th>
            <Table.Th>{verificacion ? 'Verificación' : 'Condición del equipo'}</Table.Th>
            <Table.Th>Reg.</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {mantenimientos.map((m) => (
            <Table.Tr
              key={m.id}
              // Los anulados se conservan, atenuados: ya no cuentan en los indicadores.
              style={{ cursor: 'pointer', opacity: m.anuladoEn ? 0.55 : 1 }}
              onClick={() => navigate(`/mantenimientos/${m.id}`)}
            >
              <Table.Td>
                <Anchor component={Link} to={`/mantenimientos/${m.id}`} fw={600} onClick={(e) => e.stopPropagation()}>
                  #{m.id}
                </Anchor>
                {m.planId && (
                  <Text size="xs" c="dimmed">
                    planificación PLM-{String(m.planId).padStart(4, '0')}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {m.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.activo.nombre} · {m.activo.categoria}
                </Text>
              </Table.Td>
              <Table.Td>
                <BadgeTipo tipo={m.tipo} />
              </Table.Td>
              <Table.Td maw={260}>
                <Text size="sm" lineClamp={2}>
                  {m.actividad}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={m.vencido ? 'red' : 'dimmed'} fw={m.vencido ? 600 : undefined}>
                  {formatearFechaHora(verificacion ? m.fechaFin : m.fecha)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{m.tecnico ?? '—'}</Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <BadgeFase fase={m.fase} />
                  {m.vencido && <BadgeVencido />}
                </Group>
              </Table.Td>
              <Table.Td>
                {verificacion ? <BadgeCierre cierre={m.cierre} /> : <BadgeEstadoEquipo estado={m.estadoEquipo} />}
              </Table.Td>
              <Table.Td>
                <BadgeRegistro registro={m} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/** Período (en la URL) e indicadores del módulo, como en el prototipo. */
function IndicadoresDelPeriodo() {
  const [params, setParams] = useSearchParams()
  const periodo = periodoPorId(params.get('periodo'))
  const indicadores = useIndicadoresMantenimiento(periodo.desde, periodo.hasta)
  return (
    <Stack gap="xs">
      <Group justify="flex-end">
        <SelectorPeriodo
          periodo={periodo}
          onChange={(id) => {
            const nuevos = new URLSearchParams(params)
            nuevos.set('periodo', id)
            setParams(nuevos, { replace: true })
          }}
        />
      </Group>
      <FranjaIndicadores indicadores={indicadores.data} cargando={indicadores.isPending} error={indicadores.error} />
    </Stack>
  )
}

/** Texto libre con espera: no consulta la API en cada tecla. */
function CampoTexto({ valor, onCambio, ...props }: { valor?: string; onCambio: (v: string | undefined) => void; label: string; placeholder: string; w?: object }) {
  const [texto, setTexto] = useState(valor ?? '')
  useEffect(() => setTexto(valor ?? ''), [valor])
  useEffect(() => {
    const t = setTimeout(() => {
      if ((texto.trim() || undefined) !== valor) onCambio(texto.trim() || undefined)
    }, 400)
    return () => clearTimeout(t)
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al escribir
  return <TextInput leftSection={<IconSearch size={14} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} {...props} />
}

const CALENDARIO_CAPA = {
  1: { titulo: 'Calendario de planificación', descripcion: 'Inicio previsto y fecha límite de cada ejecución pendiente; las planificaciones, en su próxima fecha.' },
  2: { titulo: 'Calendario de ejecución', descripcion: 'Lo previsto (trazo discontinuo) frente a lo ejecutado realmente; en rojo, lo vencido.' },
  3: { titulo: 'Calendario de verificación', descripcion: 'Ventanas de verificación previstas, con su propio plazo, y verificaciones registradas.' },
} as const

function CalendarioDeCapa({ capa, onCrear }: { capa: 1 | 2 | 3; onCrear?: (dia: Dayjs) => void }) {
  return <Calendario {...CALENDARIO_CAPA[capa]} modulos={['mantenimientos']} capa={capa} onCrear={onCrear} textoCrear="Nueva ejecución" />
}

export function MantenimientosPage() {
  const navigate = useNavigate()
  const { filtros, actualizar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const capa: Capa = filtros.capa ?? 'ejecucion'
  const consulta = useMantenimientos(aConsultaApi(filtros))
  const categorias = useCategorias()
  const puedeOperar = usePuedeOperar()
  const [modalAbierto, modal] = useDisclosure()
  const [diaInicial, setDiaInicial] = useState<Dayjs | null>(null)
  const programarEl = (dia: Dayjs) => {
    setDiaInicial(dia)
    modal.open()
  }
  const hayFiltros =
    filtros.fase !== undefined ||
    filtros.tipo !== undefined ||
    filtros.activoId !== undefined ||
    filtros.planId !== undefined ||
    filtros.categoriaId !== undefined ||
    filtros.q !== undefined ||
    filtros.tecnico !== undefined ||
    filtros.cierre !== undefined ||
    filtros.vencidos !== undefined
  // Quitar filtros conserva la pestaña.
  const quitarFiltros = () =>
    actualizar({
      page: 1,
      fase: undefined,
      tipo: undefined,
      activoId: undefined,
      planId: undefined,
      categoriaId: undefined,
      q: undefined,
      tecnico: undefined,
      cierre: undefined,
      vencidos: undefined,
    })

  return (
    <Stack gap="md">
      <IndicadoresDelPeriodo />
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Mantenimientos</Title>
          <Text c="dimmed" size="sm">
            Planificación → ejecución → verificación y cierre
          </Text>
          <Text c="dimmed" size="xs">
            ISO/IEC 27001:2022 · A.7.13 Mantenimiento de los equipos
          </Text>
        </div>
        {puedeOperar && (capa === 'ejecucion' || capa === 'verificacion') && (
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => {
              setDiaInicial(null)
              modal.open()
            }}
          >
            Nueva ejecución
          </Button>
        )}
      </Group>

      <Tabs value={capa} onChange={(v) => actualizar({ capa: v === 'ejecucion' ? undefined : (v as Capa), cierre: undefined, page: 1 })}>
        <Tabs.List>
          <Tabs.Tab value="planificacion" leftSection={<IconCalendarStats size={16} />}>
            1 · Planificación
          </Tabs.Tab>
          <Tabs.Tab value="ejecucion" leftSection={<IconTool size={16} />}>
            2 · Ejecución
          </Tabs.Tab>
          <Tabs.Tab value="verificacion" leftSection={<IconChecklist size={16} />}>
            3 · Verificación y cierre
          </Tabs.Tab>
          <Tabs.Tab value="bitacoras" leftSection={<IconNotebook size={16} />}>
            Bitácoras
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {capa === 'bitacoras' ? (
        <Bitacoras />
      ) : capa === 'planificacion' ? (
        <>
          <Planificacion />
          <CalendarioDeCapa capa={1} onCrear={puedeOperar ? programarEl : undefined} />
        </>
      ) : (
        <>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <CampoTexto
              label="Buscar"
              placeholder="Activo, descripción, encargado…"
              valor={filtros.q}
              onCambio={(q) => actualizar({ q, page: 1 })}
              w={{ base: '100%', sm: 220 }}
            />
            <Select
              label="Categoría"
              placeholder="Todas"
              clearable
              searchable
              data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
              value={filtros.categoriaId ? String(filtros.categoriaId) : null}
              onChange={(v) => actualizar({ categoriaId: v ? Number(v) : undefined, page: 1 })}
              w={{ base: '100%', sm: 190 }}
            />
            {capa === 'ejecucion' ? (
              <Select
                label="Situación"
                placeholder="Todas"
                clearable
                data={FASES.map((f) => ({ value: f, label: INFO_FASE[f].etiqueta }))}
                value={filtros.fase ?? null}
                onChange={(v) => actualizar({ fase: (v as Fase | null) ?? undefined, page: 1 })}
                w={{ base: '100%', sm: 160 }}
              />
            ) : (
              <Select
                label="Cierre"
                allowDeselect={false}
                data={CIERRES.map((c) => ({ value: c, label: INFO_CIERRE[c].etiqueta }))}
                value={filtros.cierre ?? 'PENDIENTE_VERIFICACION'}
                onChange={(v) => actualizar({ cierre: (v as FiltroCierre | null) ?? undefined, page: 1 })}
                w={{ base: '100%', sm: 200 }}
              />
            )}
            <Select
              label="Tipo"
              placeholder="Todos"
              clearable
              data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
              value={filtros.tipo ?? null}
              onChange={(v) => actualizar({ tipo: (v as TipoMantenimiento | null) ?? undefined, page: 1 })}
              w={{ base: '100%', sm: 140 }}
            />
            <CampoTexto
              label="Encargado"
              placeholder="Usuario o nombre"
              valor={filtros.tecnico}
              onCambio={(tecnico) => actualizar({ tecnico, page: 1 })}
              w={{ base: '100%', sm: 160 }}
            />
            <SelectorActivo
              label="Activo"
              placeholder="Todos"
              value={filtros.activoId ?? null}
              onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })}
              w={{ base: '100%', sm: 260 }}
            />
            {capa === 'ejecucion' && (
              <Switch
                label="Solo vencidos"
                color="red"
                checked={filtros.vencidos ?? false}
                onChange={(e) => actualizar({ vencidos: e.currentTarget.checked || undefined, page: 1 })}
                mb={8}
              />
            )}
          </Group>
          {filtros.planId && (
            <Group gap="xs">
              <Badge variant="light" size="lg">
                Ejecuciones de la planificación PLM-{String(filtros.planId).padStart(4, '0')}
              </Badge>
              <Button size="compact-xs" variant="subtle" onClick={() => actualizar({ planId: undefined, page: 1 })}>
                Quitar
              </Button>
            </Group>
          )}

          <TarjetaListado
            consulta={consulta}
            pagina={filtros.page}
            onPagina={(page) => actualizar({ page })}
            tituloError="No se pudieron cargar los mantenimientos"
            vacio={
              <>
                <Text c="dimmed">
                  {capa === 'verificacion'
                    ? (filtros.cierre ?? 'PENDIENTE_VERIFICACION') === 'PENDIENTE_VERIFICACION'
                      ? 'No hay ejecuciones completadas pendientes de verificar.'
                      : 'Ninguna ejecución cerrada coincide.'
                    : filtros.vencidos
                      ? 'No hay ejecuciones vencidas. ¡Todo al día!'
                      : hayFiltros
                        ? 'Ninguna ejecución coincide con los filtros.'
                        : 'Todavía no hay ejecuciones de mantenimiento.'}
                </Text>
                {hayFiltros && (
                  <Button variant="subtle" onClick={quitarFiltros}>
                    Quitar filtros
                  </Button>
                )}
              </>
            }
          >
            {(mantenimientos) => <TablaMantenimientos mantenimientos={mantenimientos} capa={capa} />}
          </TarjetaListado>
          <CalendarioDeCapa capa={capa === 'verificacion' ? 3 : 2} />
        </>
      )}

      {puedeOperar && (
        <ProgramarModal
          opened={modalAbierto}
          onClose={modal.close}
          activoInicial={filtros.activoId}
          diaInicial={diaInicial}
          onProgramado={(m) => navigate(`/mantenimientos/${m.id}`)}
        />
      )}
    </Stack>
  )
}
