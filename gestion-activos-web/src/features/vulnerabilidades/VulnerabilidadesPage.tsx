import {
  Anchor,
  Badge,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { BadgeRegistro, FranjaIndicadores, SelectorPeriodo } from '../../shared/registro/componentes.tsx'
import { periodoPorId } from '../../shared/registro/registro.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import {
  useVulnerabilidades,
  type EstadoVulnerabilidad,
  type Fuente,
  type NivelRiesgo,
  type Prioridad,
  type Vulnerabilidad,
  useIndicadoresVulnerabilidad,
} from './api/vulnerabilidades.ts'
import { BadgeEstado, BadgeNivel, BadgeSla } from './componentes/Badges.tsx'
import { RegistrarModal } from './componentes/RegistrarModal.tsx'
import {
  aConsultaApi,
  escribirFiltros,
  estadosDeVista,
  leerFiltros,
  type Vista,
} from './filtros-url.ts'
import { FUENTES, INFO_ESTADO, INFO_FUENTE, INFO_NIVEL, INFO_PRIORIDAD, NIVELES, PRIORIDADES } from './riesgo.ts'

function TablaVulnerabilidades({ vulnerabilidades }: { vulnerabilidades: Vulnerabilidad[] }) {
  const navigate = useNavigate()
  return (
    <Table.ScrollContainer minWidth={1250}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Riesgo</Table.Th>
            <Table.Th>CVE</Table.Th>
            <Table.Th>Activo</Table.Th>
            <Table.Th>Descripción</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Plazo (SLA)</Table.Th>
            <Table.Th>Detectada</Table.Th>
            <Table.Th>Reg.</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {vulnerabilidades.map((v) => (
            <Table.Tr
              key={v.id}
              // Los anulados se conservan, atenuados: ya no cuentan en los indicadores.
              style={{ cursor: 'pointer', opacity: v.anuladoEn ? 0.55 : 1 }}
              onClick={() => navigate(`/vulnerabilidades/${v.id}`)}
            >
              <Table.Td>
                <Anchor
                  component={Link}
                  to={`/vulnerabilidades/${v.id}`}
                  fw={600}
                  onClick={(e) => e.stopPropagation()}
                >
                  #{v.id}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <BadgeNivel nivel={v.nivelRiesgo} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {v.cve ?? '—'}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {v.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed">
                  {v.activo.nombre} · {v.activo.categoria}
                </Text>
              </Table.Td>
              <Table.Td maw={300}>
                <Text size="sm" lineClamp={2}>
                  {v.descripcion}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <BadgeEstado estado={v.estado} />
                  {v.estado === 'ABIERTA' && !v.confirmadaEn && (
                    <Badge size="xs" color="gray" variant="light">
                      sin confirmar
                    </Badge>
                  )}
                </Group>
                {v.prioridad && (
                  <Text size="xs" c={INFO_PRIORIDAD[v.prioridad].color} fw={600}>
                    {INFO_PRIORIDAD[v.prioridad].etiqueta}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <BadgeSla vulnerabilidad={v} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatearFechaHora(v.fecha)}
                </Text>
              </Table.Td>
              <Table.Td>
                <BadgeRegistro registro={v} />
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
  const indicadores = useIndicadoresVulnerabilidad(periodo.desde, periodo.hasta)
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

export function VulnerabilidadesPage() {
  const navigate = useNavigate()
  const { filtros, actualizar, limpiar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const consulta = useVulnerabilidades(aConsultaApi(filtros))
  const puedeOperar = usePuedeOperar()
  const categorias = useCategorias()
  const [modalAbierto, modal] = useDisclosure()

  // La búsqueda por CVE espera 400 ms sin teclear antes de consultar la API.
  const [cve, setCve] = useState(filtros.cve)
  const [cveEstable] = useDebouncedValue(cve, 400)
  useEffect(() => {
    if (cveEstable.trim() !== filtros.cve) actualizar({ cve: cveEstable.trim(), page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo tecleado
  }, [cveEstable])
  // Si la URL cambia desde fuera (botón "atrás"), el cuadro de búsqueda la refleja.
  useEffect(() => setCve(filtros.cve), [filtros.cve])

  const hayFiltros =
    filtros.nivelRiesgo !== undefined ||
    filtros.estado !== undefined ||
    filtros.activoId !== undefined ||
    filtros.categoriaId !== undefined ||
    filtros.prioridad !== undefined ||
    filtros.fuente !== undefined ||
    filtros.confirmada !== undefined ||
    filtros.cve !== '' ||
    filtros.vencidas !== undefined

  return (
    <Stack gap="md">
      <IndicadoresDelPeriodo />
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Vulnerabilidades</Title>
          <Text c="dimmed" size="sm">
            Ordenadas por urgencia: mayor riesgo primero y, dentro de cada nivel, la más antigua
          </Text>
          <Text c="dimmed" size="xs">ISO/IEC 27001:2022 · A.8.8 Gestión de las vulnerabilidades técnicas</Text>
        </div>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Registrar vulnerabilidad
          </Button>
        )}
      </Group>

      <SegmentedControl
        w={{ base: '100%', sm: 'auto' }}
        style={{ alignSelf: 'flex-start' }}
        value={filtros.vista}
        onChange={(v) =>
          // Al cambiar de vista se quita el estado (puede no existir en la nueva vista).
          actualizar({
            vista: v as Vista,
            estado: undefined,
            vencidas: v === 'cerradas' ? undefined : filtros.vencidas,
            page: 1,
          })
        }
        data={[
          { value: 'pendientes', label: 'Pendientes' },
          { value: 'cerradas', label: 'Cerradas' },
          { value: 'todas', label: 'Todas' },
        ]}
      />

      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar"
          placeholder="CVE, descripción o activo"
          leftSection={<IconSearch size={16} />}
          value={cve}
          onChange={(e) => setCve(e.currentTarget.value)}
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
        <Select
          label="Etapa"
          placeholder="Todas"
          clearable
          data={[
            { value: '0', label: 'Detectadas, sin confirmar' },
            { value: '1', label: 'Confirmadas' },
          ]}
          value={filtros.confirmada === undefined ? null : filtros.confirmada ? '1' : '0'}
          onChange={(v) => actualizar({ confirmada: v === null ? undefined : v === '1', page: 1 })}
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Prioridad"
          placeholder="Todas"
          clearable
          data={PRIORIDADES.map((p) => ({ value: p, label: INFO_PRIORIDAD[p].etiqueta }))}
          value={filtros.prioridad ?? null}
          onChange={(v) => actualizar({ prioridad: (v as Prioridad | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Fuente"
          placeholder="Todas"
          clearable
          data={FUENTES.map((f) => ({ value: f, label: INFO_FUENTE[f] }))}
          value={filtros.fuente ?? null}
          onChange={(v) => actualizar({ fuente: (v as Fuente | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Riesgo"
          placeholder="Todos"
          clearable
          data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
          value={filtros.nivelRiesgo ?? null}
          onChange={(v) =>
            actualizar({ nivelRiesgo: (v as NivelRiesgo | null) ?? undefined, page: 1 })
          }
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={estadosDeVista(filtros.vista).map((e) => ({
            value: e,
            label: INFO_ESTADO[e].etiqueta,
          }))}
          value={filtros.estado ?? null}
          onChange={(v) =>
            actualizar({ estado: (v as EstadoVulnerabilidad | null) ?? undefined, page: 1 })
          }
          w={{ base: '100%', sm: 170 }}
        />
        <SelectorActivo
          label="Activo"
          placeholder="Todos"
          value={filtros.activoId ?? null}
          onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 280 }}
        />
        {filtros.vista !== 'cerradas' && (
          <Switch
            label="Solo plazo vencido"
            color="red"
            checked={filtros.vencidas ?? false}
            onChange={(e) =>
              actualizar({ vencidas: e.currentTarget.checked || undefined, page: 1 })
            }
            mb={8}
          />
        )}
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudieron cargar las vulnerabilidades"
        vacio={
          <>
            <Text c="dimmed">
              {filtros.vencidas
                ? 'Ninguna vulnerabilidad con el plazo vencido. ¡Todo dentro del SLA!'
                : hayFiltros
                  ? 'Ninguna vulnerabilidad coincide con los filtros.'
                  : filtros.vista === 'pendientes'
                    ? 'No hay vulnerabilidades pendientes.'
                    : 'Todavía no hay vulnerabilidades en esta vista.'}
            </Text>
            {hayFiltros && (
              <Button
                variant="subtle"
                onClick={() => {
                  setCve('')
                  limpiar()
                }}
              >
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(vulnerabilidades) => <TablaVulnerabilidades vulnerabilidades={vulnerabilidades} />}
      </TarjetaListado>

      {puedeOperar && (
        <RegistrarModal
          opened={modalAbierto}
          onClose={modal.close}
          activoInicial={filtros.activoId}
          // Con varias, se queda en el listado (que ya las muestra); con una, abre su ficha.
          onRegistrada={(v, total) => total === 1 && navigate(`/vulnerabilidades/${v.id}`)}
        />
      )}
    </Stack>
  )
}
