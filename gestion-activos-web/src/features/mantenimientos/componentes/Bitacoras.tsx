import {
  Alert,
  Anchor,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatearDia, formatearFechaHora } from '../../../shared/formato.ts'
import { SelectorActivo } from '../../inventario/componentes/SelectorActivo.tsx'
import {
  useBitacoraEspecifica,
  useBitacoraGeneral,
  type FilaBitacora,
  type ResumenBitacora,
  type SituacionBitacora,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { FASES, INFO_FASE, INFO_FRECUENCIA, INFO_TIPO, TIPOS } from '../fases.ts'
import { BadgeEstadoEquipo, BadgeFase, BadgeTipo } from './Badges.tsx'

const AÑO_ACTUAL = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => String(AÑO_ACTUAL + 1 - i))
const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`

type Semestre = 1 | 2 | undefined

/** Período elegido (año y semestre planificados), común a las dos bitácoras. */
function SelectorPeriodoBitacora({ anio, semestre, onChange }: { anio: number; semestre: Semestre; onChange: (anio: number, semestre: Semestre) => void }) {
  return (
    <Group gap="sm" align="flex-end">
      <Select
        label="Año"
        data={AÑOS}
        allowDeselect={false}
        value={String(anio)}
        onChange={(v) => v && onChange(Number(v), semestre)}
        w={110}
      />
      <SegmentedControl
        data={[
          { value: '0', label: 'Año completo' },
          { value: '1', label: 'S1 · ene–jun' },
          { value: '2', label: 'S2 · jul–dic' },
        ]}
        value={String(semestre ?? 0)}
        onChange={(v) => onChange(anio, v === '0' ? undefined : (Number(v) as 1 | 2))}
      />
    </Group>
  )
}

function FilaResumen({ r, total = false }: { r: ResumenBitacora; total?: boolean }) {
  const porcentaje = r.cumplimiento
  return (
    <Table.Tr fw={total ? 700 : undefined} bg={total ? 'var(--mantine-color-default-hover)' : undefined}>
      <Table.Td>{total ? `Total ${r.periodo.etiqueta}` : r.periodo.etiqueta}</Table.Td>
      <Table.Td ta="right">{r.planificadas}</Table.Td>
      <Table.Td ta="right" c="dimmed">
        {r.suspendidas}
      </Table.Td>
      <Table.Td ta="right">{r.esperadas}</Table.Td>
      <Table.Td ta="right" c="green">
        {r.cumplidas}
      </Table.Td>
      <Table.Td ta="right" c={r.pendientes ? 'orange' : undefined}>
        {r.pendientes}
      </Table.Td>
      <Table.Td miw={170}>
        {porcentaje === null ? (
          <Text size="sm" c="dimmed">
            — (sin planificaciones exigibles)
          </Text>
        ) : (
          <Group gap="xs" wrap="nowrap">
            <Progress value={porcentaje} color={porcentaje >= 80 ? 'green' : porcentaje >= 50 ? 'yellow' : 'red'} w={90} aria-label={`Cumplimiento ${porcentaje} %`} />
            <Text size="sm" fw={600}>
              {porcentaje} %
            </Text>
          </Group>
        )}
      </Table.Td>
      <Table.Td ta="right">
        {r.ejecucionesCompletadas}
        {r.ejecucionesSinPlanificacion > 0 && (
          <Text span size="xs" c="dimmed">
            {' '}
            ({r.ejecucionesSinPlanificacion} sin planificación)
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  )
}

/** Bitácora General: cumplimiento por semestre (sin doble conteo). */
function BitacoraGeneral({ anio, semestre }: { anio: number; semestre: Semestre }) {
  const { data, isPending, error } = useBitacoraGeneral(anio, semestre)
  return (
    <Card withBorder padding="lg">
      <Title order={4}>Bitácora General</Title>
      <Text size="sm" c="dimmed" mb="sm">
        Cada planificación cuenta una vez, en el semestre de su fecha de inicio planificada; está cumplida si tiene al menos una
        ejecución completada (aunque se ejecute en otro semestre). Las suspendidas sin ejecución no son exigibles. Las ejecuciones
        completadas se cuentan aparte, en su semestre real. Los registros anulados no cuentan.
      </Text>
      {error ? (
        <Alert color="red">{error.message}</Alert>
      ) : isPending ? (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Semestre</Table.Th>
                <Table.Th ta="right">Planificadas</Table.Th>
                <Table.Th ta="right">Suspendidas</Table.Th>
                <Table.Th ta="right">Exigibles</Table.Th>
                <Table.Th ta="right">Cumplidas</Table.Th>
                <Table.Th ta="right">Pendientes</Table.Th>
                <Table.Th>Cumplimiento</Table.Th>
                <Table.Th ta="right">Ejecuciones completadas (semestre real)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.semestres.map((r) => (
                <FilaResumen key={r.periodo.etiqueta} r={r} />
              ))}
              {data.semestres.length > 1 && <FilaResumen r={data.total} total />}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  )
}

const INFO_SITUACION: Record<SituacionBitacora, { etiqueta: string; color: string }> = {
  ...INFO_FASE,
  SIN_EJECUCION: { etiqueta: 'Sin ejecución', color: 'gray' },
}

function CeldaSituacion({ f }: { f: FilaBitacora }) {
  if (f.situacion === 'SIN_EJECUCION') {
    return (
      <Badge variant="outline" color="gray">
        Sin ejecución
      </Badge>
    )
  }
  return <BadgeFase fase={f.situacion} />
}

/** Bitácora Específica: una fila por ejecución (con su planificación) o por planificación sin ejecución. */
function BitacoraEspecifica({ anio, semestre }: { anio: number; semestre: Semestre }) {
  const navigate = useNavigate()
  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState<{ activoId?: number; tipo?: TipoMantenimiento; situacion?: SituacionBitacora; responsable: string }>({ responsable: '' })
  const [responsable] = useDebouncedValue(filtros.responsable.trim(), 300)
  const cambiar = (c: Partial<typeof filtros>) => {
    setFiltros((f) => ({ ...f, ...c }))
    setPagina(1)
  }
  const { data, isPending, error } = useBitacoraEspecifica({
    anio,
    semestre,
    activoId: filtros.activoId,
    tipo: filtros.tipo,
    situacion: filtros.situacion,
    responsable: responsable || undefined,
    page: pagina,
    limit: 20,
  })

  return (
    <Card withBorder padding="lg">
      <Title order={4}>Bitácora Específica</Title>
      <Text size="sm" c="dimmed" mb="sm">
        Lo planificado junto a lo ejecutado. El año y el semestre son los planificados; las fechas reales y su semestre, los de la
        ejecución.
      </Text>
      <Group gap="sm" align="flex-end" wrap="wrap" mb="sm">
        <SelectorActivo label="Activo" placeholder="Todos" value={filtros.activoId ?? null} onChange={(id) => cambiar({ activoId: id ?? undefined })} w={{ base: '100%', sm: 260 }} />
        <Select
          label="Tipo"
          placeholder="Todos"
          clearable
          data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
          value={filtros.tipo ?? null}
          onChange={(v) => cambiar({ tipo: (v as TipoMantenimiento | null) ?? undefined })}
          w={{ base: '100%', sm: 150 }}
        />
        <TextInput
          label="Responsable"
          placeholder="Asignado o encargado"
          leftSection={<IconSearch size={14} />}
          value={filtros.responsable}
          onChange={(e) => cambiar({ responsable: e.currentTarget.value })}
          w={{ base: '100%', sm: 190 }}
        />
        <Select
          label="Situación"
          placeholder="Todas"
          clearable
          data={[...FASES, 'SIN_EJECUCION' as const].map((s) => ({ value: s, label: INFO_SITUACION[s].etiqueta }))}
          value={filtros.situacion ?? null}
          onChange={(v) => cambiar({ situacion: (v as SituacionBitacora | null) ?? undefined })}
          w={{ base: '100%', sm: 170 }}
        />
      </Group>
      {error ? (
        <Alert color="red">{error.message}</Alert>
      ) : isPending ? (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      ) : data.data.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No hay registros en este período con esos filtros.
        </Text>
      ) : (
        <>
          <Text size="xs" c="dimmed" mb={4}>
            {data.meta.total} registro(s)
          </Text>
          <Table.ScrollContainer minWidth={1700}>
            <Table striped highlightOnHover verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Planificación</Table.Th>
                  <Table.Th>Activo</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Asignado</Table.Th>
                  <Table.Th>Descripción planificada</Table.Th>
                  <Table.Th>Ejecución</Table.Th>
                  <Table.Th>Fecha real de mantenimiento</Table.Th>
                  <Table.Th>Fecha real de finalización</Table.Th>
                  <Table.Th>Encargado</Table.Th>
                  <Table.Th>Descripción de la ejecución</Table.Th>
                  <Table.Th>Condición</Table.Th>
                  <Table.Th>Verificable</Table.Th>
                  <Table.Th>Situación</Table.Th>
                  <Table.Th>Registro</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.data.map((f) => (
                  <Table.Tr
                    key={f.clave}
                    style={{ cursor: f.mantenimientoId ? 'pointer' : undefined }}
                    onClick={() => f.mantenimientoId && navigate(`/mantenimientos/${f.mantenimientoId}`)}
                  >
                    <Table.Td>
                      {f.planId ? (
                        <>
                          <Text size="sm" ff="monospace">
                            {folio(f.planId)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {f.periodo ? INFO_FRECUENCIA[f.periodo] : ''} · {formatearDia(f.fechaInicioPlanificada)}
                          </Text>
                          {f.semestrePlanificado && (
                            <Badge size="xs" variant="outline">
                              {f.semestrePlanificado.etiqueta}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Sin planificación (registro anterior)
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/activos/${f.activo.id}`} size="sm" fw={600} onClick={(e) => e.stopPropagation()}>
                        {f.activo.codigo}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {f.activo.nombre}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {f.tipo ? <BadgeTipo tipo={f.tipo} /> : f.tipoPlanificado && <BadgeTipo tipo={f.tipoPlanificado} />}
                      {f.tipo && f.tipoPlanificado && f.tipo !== f.tipoPlanificado && (
                        <Text size="xs" c="dimmed">
                          planificado: {INFO_TIPO[f.tipoPlanificado].etiqueta}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{f.asignado ?? '—'}</Table.Td>
                    <Table.Td maw={240}>
                      <Text size="sm" lineClamp={2}>
                        {f.descripcionPlanificada ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {f.mantenimientoId ? (
                        <Anchor component={Link} to={`/mantenimientos/${f.mantenimientoId}`} size="sm" onClick={(e) => e.stopPropagation()}>
                          #{f.mantenimientoId}
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {formatearFechaHora(f.fechaInicio)}
                      {f.semestreReal && f.semestreReal.etiqueta !== f.semestrePlanificado?.etiqueta && (
                        <Badge size="xs" variant="light" color="grape" ml={4} title="Ejecutada en otro semestre que el planificado">
                          {f.semestreReal.etiqueta}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{formatearFechaHora(f.fechaFin)}</Table.Td>
                    <Table.Td>{f.tecnico ?? '—'}</Table.Td>
                    <Table.Td maw={240}>
                      <Text size="sm" lineClamp={2}>
                        {f.resultado ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{f.estadoEquipo ? <BadgeEstadoEquipo estado={f.estadoEquipo} /> : '—'}</Table.Td>
                    <Table.Td maw={200}>
                      <Text size="sm">{f.evidencia ?? '—'}</Text>
                      {f.repositorioVerificable && (
                        <Text size="xs" c="dimmed" lineClamp={1} title={f.repositorioVerificable}>
                          {f.repositorioVerificable}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <CeldaSituacion f={f} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {formatearFechaHora(f.registradoEn)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {data.meta.totalPages > 1 && (
            <Group justify="center" pt="sm">
              <Pagination total={data.meta.totalPages} value={pagina} onChange={setPagina} />
            </Group>
          )}
        </>
      )}
    </Card>
  )
}

/** Pestaña Bitácoras: General (cumplimiento) y Específica (detalle), del mismo período. */
export function Bitacoras() {
  const [periodo, setPeriodo] = useState<{ anio: number; semestre: Semestre }>({ anio: AÑO_ACTUAL, semestre: undefined })
  return (
    <Stack gap="md">
      <SelectorPeriodoBitacora anio={periodo.anio} semestre={periodo.semestre} onChange={(anio, semestre) => setPeriodo({ anio, semestre })} />
      <BitacoraGeneral anio={periodo.anio} semestre={periodo.semestre} />
      <BitacoraEspecifica key={`${periodo.anio}-${periodo.semestre ?? 0}`} anio={periodo.anio} semestre={periodo.semestre} />
    </Stack>
  )
}
