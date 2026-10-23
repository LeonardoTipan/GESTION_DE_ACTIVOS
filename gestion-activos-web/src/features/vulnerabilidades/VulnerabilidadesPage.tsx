import {
  Anchor,
  Button,
  Group,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { IconPlus, IconSearch, IconShieldCheck, IconShieldSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Calendario } from '../../shared/calendario/Calendario.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearDia } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { BadgeRegistro, FranjaIndicadores, SelectorPeriodo } from '../../shared/registro/componentes.tsx'
import { periodoPorId } from '../../shared/registro/registro.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import {
  useIndicadoresVulnerabilidad,
  useVulnerabilidades,
  type EstadoVulnerabilidad,
  type NivelRiesgo,
  type Vulnerabilidad,
} from './api/vulnerabilidades.ts'
import { BadgeEstado, BadgeNivel, BadgeSla } from './componentes/Badges.tsx'
import { RegistrarModal } from './componentes/RegistrarModal.tsx'
import { aConsultaApi, escribirFiltros, leerFiltros, type Fase } from './filtros-url.ts'
import { ESTADOS, INFO_ESTADO, INFO_NIVEL, NIVELES } from './riesgo.ts'

/** Texto que puede ser largo: dos líneas y el resto en el título. */
function Corto({ texto, ancho = 220 }: { texto: string | null; ancho?: number }) {
  if (!texto) return <Text size="sm" c="dimmed">—</Text>
  return (
    <Text size="sm" lineClamp={2} maw={ancho} title={texto}>
      {texto}
    </Text>
  )
}

/** La matriz: los 10 campos (y el plazo), con la clase Hardware/Software del sistema. */
function TablaVulnerabilidades({ vulnerabilidades }: { vulnerabilidades: Vulnerabilidad[] }) {
  const navigate = useNavigate()
  const categorias = useCategorias()
  const claseDe = (categoriaId: number) => categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null
  return (
    <Table.ScrollContainer minWidth={1700}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Fecha detección</Table.Th>
            <Table.Th>Sistema</Table.Th>
            <Table.Th>Vulnerabilidad</Table.Th>
            <Table.Th>Criticidad</Table.Th>
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Fecha de remediación</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Verificable</Table.Th>
            <Table.Th>Repositorio verificable</Table.Th>
            <Table.Th>Observación</Table.Th>
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
                <Anchor component={Link} to={`/vulnerabilidades/${v.id}`} fw={600} onClick={(e) => e.stopPropagation()}>
                  #{v.id}
                </Anchor>
                {v.cve && (
                  <Text size="xs" ff="monospace" c="dimmed">
                    {v.cve}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{formatearDia(v.fecha)}</Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {v.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed" maw={200}>
                  {v.activo.nombre}
                </Text>
                <BadgeClase clase={claseDe(v.activo.categoriaId)} size="xs" />
              </Table.Td>
              <Table.Td>
                <Corto texto={v.descripcion} />
              </Table.Td>
              <Table.Td>
                <BadgeNivel nivel={v.nivelRiesgo} />
              </Table.Td>
              <Table.Td>{v.responsable ?? '—'}</Table.Td>
              <Table.Td>
                {v.fechaRemediacion ? (
                  formatearDia(v.fechaRemediacion)
                ) : (
                  <Text size="sm" c="dimmed">
                    No remediada
                  </Text>
                )}
                {v.fechaLimite && <BadgeSla vulnerabilidad={v} />}
              </Table.Td>
              <Table.Td>
                <BadgeEstado estado={v.estado} />
              </Table.Td>
              <Table.Td>
                <Corto texto={v.evidencia} ancho={200} />
              </Table.Td>
              <Table.Td>
                <Corto texto={v.repositorioVerificable} ancho={180} />
              </Table.Td>
              <Table.Td>
                <Corto texto={v.observacion} />
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

/** Período (en la URL) e indicadores del módulo. */
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
 * Vulnerabilidades en DOS fases sobre el mismo registro:
 *   1 · Detección: el registro (la matriz completa) y el alta de nuevas.
 *   2 · Remediación: lo pendiente de remediar (o el estado elegido).
 */
export function VulnerabilidadesPage() {
  const navigate = useNavigate()
  const { filtros, actualizar, limpiar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const fase: Fase = filtros.fase ?? 'deteccion'
  const consulta = useVulnerabilidades(aConsultaApi(filtros))
  const puedeOperar = usePuedeOperar()
  const categorias = useCategorias()
  const [modalAbierto, modal] = useDisclosure()

  const hayFiltros =
    filtros.nivelRiesgo !== undefined ||
    filtros.estado !== undefined ||
    filtros.activoId !== undefined ||
    filtros.categoriaId !== undefined ||
    filtros.responsable !== undefined ||
    filtros.desde !== undefined ||
    filtros.hasta !== undefined ||
    filtros.q !== undefined ||
    filtros.vencidas !== undefined

  return (
    <Stack gap="md">
      <IndicadoresDelPeriodo />
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Vulnerabilidades</Title>
          <Text c="dimmed" size="sm">
            Dos fases: detección → remediación · las más críticas y antiguas primero
          </Text>
          <Text c="dimmed" size="xs">
            ISO/IEC 27001:2022 · A.8.8 Gestión de las vulnerabilidades técnicas
          </Text>
        </div>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Registrar vulnerabilidad
          </Button>
        )}
      </Group>

      <Tabs value={fase} onChange={(v) => actualizar({ fase: v === 'remediacion' ? 'remediacion' : undefined, estado: undefined, page: 1 })}>
        <Tabs.List>
          <Tabs.Tab value="deteccion" leftSection={<IconShieldSearch size={16} />}>
            1 · Detección
          </Tabs.Tab>
          <Tabs.Tab value="remediacion" leftSection={<IconShieldCheck size={16} />}>
            2 · Remediación
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Text size="sm" c="dimmed">
        {fase === 'deteccion'
          ? 'Registro de las vulnerabilidades detectadas, en cualquier estado. Abra una para corregir su detección o pasar a la remediación.'
          : 'Lo pendiente de remediar (abierto o en progreso). Abra una para iniciar la remediación, registrar la fecha real, el verificable y su repositorio, y marcarla como remediada.'}
      </Text>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <CampoTexto label="Buscar" placeholder="CVE, descripción o sistema" valor={filtros.q} onCambio={(q) => actualizar({ q, page: 1 })} w={{ base: '100%', sm: 220 }} />
        <SelectorActivo
          label="Sistema"
          placeholder="Todos"
          value={filtros.activoId ?? null}
          onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 260 }}
        />
        <Select
          label="Categoría"
          placeholder="Todas"
          clearable
          searchable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
          value={filtros.categoriaId ? String(filtros.categoriaId) : null}
          onChange={(v) => actualizar({ categoriaId: v ? Number(v) : undefined, page: 1 })}
          w={{ base: '100%', sm: 180 }}
        />
        <Select
          label="Criticidad"
          placeholder="Todas"
          clearable
          data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
          value={filtros.nivelRiesgo ?? null}
          onChange={(v) => actualizar({ nivelRiesgo: (v as NivelRiesgo | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 140 }}
        />
        <CampoTexto label="Responsable" placeholder="ANALISTA 1" valor={filtros.responsable} onCambio={(responsable) => actualizar({ responsable, page: 1 })} w={{ base: '100%', sm: 160 }} />
        <Select
          label="Estado"
          placeholder={fase === 'remediacion' ? 'Pendientes' : 'Todos'}
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => actualizar({ estado: (v as EstadoVulnerabilidad | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 150 }}
        />
        <DatePickerInput
          type="range"
          label="Detectadas entre"
          placeholder="Rango de fechas"
          clearable
          valueFormat="DD MMM YYYY"
          value={[filtros.desde ?? null, filtros.hasta ?? null]}
          onChange={([desde, hasta]) => {
            // Se aplica cuando el rango está completo (o al borrarlo).
            if ((desde && hasta) || (!desde && !hasta)) actualizar({ desde: desde ?? undefined, hasta: hasta ?? undefined, page: 1 })
          }}
          w={{ base: '100%', sm: 250 }}
        />
        <Switch
          label="Solo plazo vencido"
          color="red"
          checked={filtros.vencidas ?? false}
          onChange={(e) => actualizar({ vencidas: e.currentTarget.checked || undefined, page: 1 })}
          mb={8}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudieron cargar las vulnerabilidades"
        vacio={
          <>
            <Text c="dimmed">
              {hayFiltros
                ? 'Ninguna vulnerabilidad coincide con los filtros.'
                : fase === 'remediacion'
                  ? 'No hay vulnerabilidades pendientes de remediar.'
                  : 'Todavía no hay vulnerabilidades registradas.'}
            </Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={limpiar}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(vulnerabilidades) => <TablaVulnerabilidades vulnerabilidades={vulnerabilidades} />}
      </TarjetaListado>

      <Calendario
        titulo={fase === 'deteccion' ? 'Calendario de detección' : 'Calendario de remediación'}
        descripcion={
          fase === 'deteccion'
            ? 'Cuándo se detectó cada vulnerabilidad y, si lo tiene, su plazo de remediación.'
            : 'Lo pendiente hasta su plazo, el inicio real y la fecha REAL de remediación.'
        }
        modulos={['vulnerabilidades']}
        capa={fase === 'deteccion' ? 1 : 2}
      />

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
