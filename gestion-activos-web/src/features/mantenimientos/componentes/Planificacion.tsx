import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCalendarPlus, IconPlus, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { fechaHoraLocalAIso, formatearDia, formatearFechaHora, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import {
  AccionesRegistro,
  BadgeRegistro,
  CampoMotivoCambio,
  MotivoModal,
  TrazasModal,
  type ModoMotivo,
} from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { usePuedeOperar } from '../../auth/use-puede.ts'
import { SeleccionActivos } from '../../inventario/componentes/SeleccionActivos.tsx'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import {
  useAnulacionPlanMantenimiento,
  useCrearPlanesMantenimiento,
  useModificarPlanMantenimiento,
  usePlanesMantenimiento,
  useProgramarDesdePlan,
  useTableroMantenimientos,
  type FrecuenciaMantenimiento,
  type PlanMantenimiento,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { FRECUENCIAS, INFO_FRECUENCIA, INFO_TIPO, TIPOS } from '../fases.ts'
import { BadgeTipo } from './Badges.tsx'

const ETIQUETAS_PLAN: Record<string, string> = {
  tipo: 'Tipo',
  frecuencia: 'Frecuencia',
  proximaFecha: 'Próxima fecha',
  plazoDias: 'Plazo (días)',
  responsable: 'Responsable',
  actividades: 'Actividades',
  estado: 'Estado',
}

const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`

function Cifra({ titulo, valor, color, pista }: { titulo: string; valor: number | undefined; color?: string; pista: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {titulo}
      </Text>
      <Text fz={28} fw={700} c={valor ? color : undefined}>
        {valor ?? '—'}
      </Text>
      <Text size="xs" c="dimmed">
        {pista}
      </Text>
    </Card>
  )
}

/** Tablero de la capa 1: cifras y calendario de los próximos 60 días. */
function Tablero() {
  const { data, isPending, error } = useTableroMantenimientos()
  if (error) return <Alert color="red">{error.message}</Alert>
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Cifra titulo="Próximas intervenciones" valor={data?.proximas.length} pista="Planes y programados en 60 días" />
        <Cifra titulo="Activos sin plan preventivo" valor={data?.activosSinPlan} color="orange" pista="Operativos, sin plan vigente" />
        <Cifra titulo="Planes vencidos" valor={data?.planesVencidos} color="red" pista="Próxima fecha ya pasada" />
        <Cifra titulo="Pendientes de verificar" valor={data?.pendientesVerificacion} color="yellow" pista="Finalizados sin verificación" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder padding="sm">
          <Title order={5} mb="xs">
            Calendario · próximos 60 días
          </Title>
          {isPending ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : data.proximas.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay intervenciones previstas.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={260} type="auto">
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {data.proximas.map((p) => (
                    <Table.Tr key={`${p.origen}-${p.id}`}>
                      <Table.Td c={p.vencido ? 'red' : undefined} fw={p.vencido ? 600 : undefined} w={150}>
                        {formatearDia(p.fecha)}
                      </Table.Td>
                      <Table.Td>
                        {p.activo.codigo} · {p.activo.nombre}
                        <Text size="xs" c="dimmed">
                          {p.activo.categoria}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <BadgeTipo tipo={p.tipo} />
                      </Table.Td>
                      <Table.Td>
                        {p.origen === 'PLAN' ? (
                          <Badge variant="outline" color="gray">
                            {folio(p.id)} · por programar
                          </Badge>
                        ) : (
                          <Anchor component={Link} to={`/mantenimientos/${p.id}`} size="sm">
                            Programado #{p.id}
                          </Anchor>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
        </Card>
        <Card withBorder padding="sm">
          <Title order={5} mb="xs">
            Activos operativos sin plan preventivo
          </Title>
          {data && data.ejemplosSinPlan.length === 0 ? (
            <Text size="sm" c="dimmed">
              Todos los activos operativos tienen un plan preventivo vigente.
            </Text>
          ) : (
            <Stack gap={2}>
              {data?.ejemplosSinPlan.map((a) => (
                <Text size="sm" key={a.id}>
                  <Anchor component={Link} to={`/activos/${a.id}`}>
                    {a.codigo}
                  </Anchor>{' '}
                  · {a.nombre}{' '}
                  <Text span size="xs" c="dimmed">
                    ({a.categoria})
                  </Text>
                </Text>
              ))}
              {data && data.activosSinPlan > data.ejemplosSinPlan.length && (
                <Text size="xs" c="dimmed">
                  … y {data.activosSinPlan - data.ejemplosSinPlan.length} más.
                </Text>
              )}
            </Stack>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  )
}

interface ValoresPlan {
  tipo: TipoMantenimiento
  frecuencia: FrecuenciaMantenimiento
  proximaFecha: string | null
  plazoDias: number | string
  responsable: string
  actividades: string
  estado: 'VIGENTE' | 'SUSPENDIDO'
  motivoCambio: string
}

/** Crear (para varios activos a la vez) o modificar (con motivo) un plan. */
function PlanModal({ abierto, plan, onCerrar }: { abierto: boolean; plan: PlanMantenimiento | null; onCerrar: () => void }) {
  return (
    <Modal opened={abierto} onClose={onCerrar} size="xl" title={plan ? `Modificar ${folio(plan.id)} · v${plan.version}` : 'Nuevo plan de mantenimiento'}>
      {abierto && <FormPlan plan={plan} onCerrar={onCerrar} />}
    </Modal>
  )
}

function FormPlan({ plan, onCerrar }: { plan: PlanMantenimiento | null; onCerrar: () => void }) {
  const crear = useCrearPlanesMantenimiento()
  const modificar = useModificarPlanMantenimiento()
  const [seleccion, setSeleccion] = useState<number[]>([])
  const vigentes = usePlanesMantenimiento({ estado: 'VIGENTE', page: 1, limit: 100 })

  const form = useForm<ValoresPlan>({
    initialValues: plan
      ? {
          tipo: plan.tipo,
          frecuencia: plan.frecuencia,
          proximaFecha: plan.proximaFecha ? isoAFechaHoraLocal(plan.proximaFecha) : null,
          plazoDias: plan.plazoDias ?? 7,
          responsable: plan.responsable,
          actividades: plan.actividades,
          estado: plan.estado,
          motivoCambio: '',
        }
      : { tipo: 'PREVENTIVO', frecuencia: 'TRIMESTRAL', proximaFecha: null, plazoDias: 7, responsable: '', actividades: '', estado: 'VIGENTE', motivoCambio: '' },
    validate: {
      proximaFecha: (v) => (v ? null : 'Indica la primera intervención'),
      plazoDias: (v) => (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 365 ? 'Entre 1 y 365 días' : null),
      responsable: (v) => (!v.trim() ? 'Obligatorio' : v.length > 191 ? 'Máximo 191' : null),
      actividades: (v) => (v.trim().length < 10 ? 'Mínimo 10 caracteres' : v.length > 2000 ? 'Máximo 2000' : null),
      motivoCambio: (v) => (plan ? errorMotivo(v) : null),
    },
  })

  const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
  const enviar = form.onSubmit((v) => {
    const parametros = {
      tipo: v.tipo,
      frecuencia: v.frecuencia,
      proximaFecha: fechaHoraLocalAIso(v.proximaFecha!),
      plazoDias: Number(v.plazoDias),
      responsable: v.responsable.trim(),
      actividades: v.actividades.trim(),
    }
    if (plan) {
      modificar.mutate(
        { id: plan.id, datos: { ...parametros, estado: v.estado, motivoCambio: v.motivoCambio.trim() } },
        {
          onSuccess: (p) => {
            notifications.show({ color: 'green', title: 'Plan modificado', message: `${folio(p.id)} · versión ${p.version}` })
            onCerrar()
          },
          onError: error,
        },
      )
      return
    }
    if (seleccion.length === 0) {
      notifications.show({ color: 'red', title: 'Seleccione al menos un activo', message: 'Marque los activos a incluir.' })
      return
    }
    crear.mutate(
      { ...parametros, activoIds: seleccion },
      {
        onSuccess: (creados) => {
          notifications.show({ color: 'green', title: 'Planes creados', message: `${creados.length} plan(es) de mantenimiento.` })
          onCerrar()
        },
        onError: error,
      },
    )
  })

  const conPlanDelTipo = new Set(
    (vigentes.data?.data ?? []).filter((p) => !p.anuladoEn && p.tipo === form.values.tipo).map((p) => p.activoId),
  )
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {plan ? (
          <TextInput label="Activo" value={`${plan.activo.codigo} · ${plan.activo.nombre}`} disabled description="El activo no se sustituye: anule el plan y cree otro." />
        ) : (
          <SeleccionActivos
            titulo="Seleccionar activos para mantenimiento"
            etiqueta="Activos"
            value={seleccion}
            onChange={setSeleccion}
            // Regla del módulo: un plan vigente por activo y tipo. La condición "Malo" no excluye.
            noElegible={(a) =>
              conPlanDelTipo.has(a.id) ? `Ya tiene un plan ${INFO_TIPO[form.values.tipo].etiqueta.toLowerCase()} vigente.` : null
            }
            ayuda="Solo se ofrecen activos operativos (también en condición «Malo»). Se crea un plan por activo con los parámetros siguientes."
          />
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select label="Tipo" withAsterisk data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))} allowDeselect={false} {...form.getInputProps('tipo')} />
          <Select
            label="Frecuencia"
            withAsterisk
            data={FRECUENCIAS.map((f) => ({ value: f, label: INFO_FRECUENCIA[f] }))}
            allowDeselect={false}
            {...form.getInputProps('frecuencia')}
          />
          <DateTimePicker label="Próxima intervención (inicio previsto)" valueFormat="DD MMM YYYY HH:mm" withAsterisk {...form.getInputProps('proximaFecha')} />
          <NumberInput
            label="Plazo de cada intervención (días)"
            description="Fecha límite = inicio previsto + plazo"
            withAsterisk
            min={1}
            max={365}
            allowDecimal={false}
            {...form.getInputProps('plazoDias')}
          />
          <TextInput label="Responsable" withAsterisk placeholder="Soporte TIC" {...form.getInputProps('responsable')} />
          {plan && (
            <Select
              label="Estado del plan"
              data={[
                { value: 'VIGENTE', label: 'Vigente' },
                { value: 'SUSPENDIDO', label: 'Suspendido' },
              ]}
              allowDeselect={false}
              {...form.getInputProps('estado')}
            />
          )}
        </SimpleGrid>
        <Textarea
          label="Actividades previstas"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Limpieza interna, revisión de ventiladores, actualización de firmware."
          {...form.getInputProps('actividades')}
        />
        {plan && <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" loading={crear.isPending || modificar.isPending}>
            {plan ? 'Guardar cambios' : `Crear ${seleccion.length || ''} plan(es)`}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/** Capa 1 · Planificación: tablero, planes (filtros y paginación) y acciones. */
export function Planificacion() {
  const puedeOperar = usePuedeOperar()
  const categorias = useCategorias()
  const [filtros, setFiltros] = useState<{
    page: number
    tipo?: TipoMantenimiento
    estado?: 'VIGENTE' | 'SUSPENDIDO'
    categoriaId?: number
    vencidos?: boolean
    q: string
  }>({ page: 1, q: '' })
  const [q] = useDebouncedValue(filtros.q, 300)
  const planes = usePlanesMantenimiento({
    page: filtros.page,
    limit: 20,
    tipo: filtros.tipo,
    estado: filtros.estado,
    categoriaId: filtros.categoriaId,
    vencidos: filtros.vencidos,
    q: q || undefined,
  })
  const programar = useProgramarDesdePlan()
  const anulacion = useAnulacionPlanMantenimiento()
  const [modal, setModal] = useState<{ plan: PlanMantenimiento | null } | null>(null)
  const [motivo, setMotivo] = useState<{ plan: PlanMantenimiento; modo: ModoMotivo } | null>(null)
  const [trazas, setTrazas] = useState<PlanMantenimiento | null>(null)
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))

  const programarPlan = (p: PlanMantenimiento) =>
    programar.mutate(p.id, {
      onSuccess: (r) =>
        notifications.show({
          color: 'green',
          title: `Mantenimiento #${r.mantenimientoId} programado`,
          message: r.plan.proximaFecha
            ? `Siguiente intervención del plan: ${formatearDia(r.plan.proximaFecha)}.`
            : 'Era un plan de una sola vez: no quedan intervenciones.',
        }),
      onError: (e) => notifications.show({ color: 'red', title: 'No se pudo programar', message: e.message }),
    })

  return (
    <Stack gap="md">
      <Tablero />
      <Group justify="space-between" align="flex-end">
        <Title order={4}>Planes de mantenimiento</Title>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ plan: null })}>
            Nuevo plan
          </Button>
        )}
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar"
          placeholder="Activo, categoría, responsable…"
          leftSection={<IconSearch size={14} />}
          value={filtros.q}
          onChange={(e) => cambiar({ q: e.currentTarget.value })}
          w={{ base: '100%', sm: 240 }}
        />
        <Select
          label="Categoría"
          placeholder="Todas"
          clearable
          searchable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
          value={filtros.categoriaId ? String(filtros.categoriaId) : null}
          onChange={(v) => cambiar({ categoriaId: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Tipo"
          placeholder="Todos"
          clearable
          data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
          value={filtros.tipo ?? null}
          onChange={(v) => cambiar({ tipo: (v as TipoMantenimiento | null) ?? undefined })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={[
            { value: 'VIGENTE', label: 'Vigente' },
            { value: 'SUSPENDIDO', label: 'Suspendido' },
          ]}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as 'VIGENTE' | 'SUSPENDIDO' | null) ?? undefined })}
          w={{ base: '100%', sm: 150 }}
        />
        <Switch label="Solo vencidos" color="red" checked={filtros.vencidos ?? false} onChange={(e) => cambiar({ vencidos: e.currentTarget.checked || undefined })} mb={8} />
      </Group>

      <Card withBorder padding={0}>
        {planes.error && <Alert color="red">{planes.error.message}</Alert>}
        {planes.isPending ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : planes.data && planes.data.data.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {filtros.q || filtros.tipo || filtros.estado || filtros.categoriaId || filtros.vencidos
              ? 'Ningún plan coincide con los filtros.'
              : 'Todavía no hay planes de mantenimiento.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={1350}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th>Activo</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Frecuencia</Table.Th>
                  <Table.Th>Próxima</Table.Th>
                  <Table.Th>Responsable</Table.Th>
                  <Table.Th>Interv.</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Reg.</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {planes.data?.data.map((p) => {
                  const programable = puedeOperar && !p.anuladoEn && p.estado === 'VIGENTE' && p.proximaFecha !== null
                  return (
                    <Table.Tr key={p.id} style={{ opacity: p.anuladoEn ? 0.55 : 1 }}>
                      <Table.Td ff="monospace">{folio(p.id)}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/activos/${p.activoId}`} size="sm" fw={600}>
                          {p.activo.codigo}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {p.activo.nombre} · {p.activo.categoria}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <BadgeTipo tipo={p.tipo} />
                      </Table.Td>
                      <Table.Td>{INFO_FRECUENCIA[p.frecuencia]}</Table.Td>
                      <Table.Td c={p.vencido ? 'red' : undefined} fw={p.vencido ? 600 : undefined}>
                        {p.proximaFecha ? formatearFechaHora(p.proximaFecha) : '— (concluido)'}
                      </Table.Td>
                      <Table.Td>{p.responsable}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/mantenimientos?planId=${p.id}`} size="sm">
                          {p.intervenciones}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={p.estado === 'VIGENTE' ? 'green' : 'gray'}>
                          {p.estado === 'VIGENTE' ? 'Vigente' : 'Suspendido'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <BadgeRegistro registro={p} />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {programable && (
                            <Button
                              size="compact-xs"
                              color="teal"
                              leftSection={<IconCalendarPlus size={12} />}
                              loading={programar.isPending && programar.variables === p.id}
                              onClick={() => programarPlan(p)}
                            >
                              Programar
                            </Button>
                          )}
                          <AccionesRegistro
                            registro={p}
                            onModificar={() => setModal({ plan: p })}
                            onAnular={() => setMotivo({ plan: p, modo: 'anular' })}
                            onReversar={() => setMotivo({ plan: p, modo: 'reversar' })}
                            onTrazas={() => setTrazas(p)}
                          />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {planes.data && planes.data.meta.totalPages > 1 && (
          <Group justify="center" p="sm">
            <Pagination total={planes.data.meta.totalPages} value={filtros.page} onChange={(page) => setFiltros((f) => ({ ...f, page }))} />
          </Group>
        )}
      </Card>

      <PlanModal abierto={modal !== null} plan={modal?.plan ?? null} onCerrar={() => setModal(null)} />
      <MotivoModal
        abierto={motivo !== null}
        modo={motivo?.modo ?? 'anular'}
        titulo={motivo ? `${motivo.modo === 'anular' ? 'Anular' : 'Revertir la anulación de'} ${folio(motivo.plan.id)}` : ''}
        enviando={anulacion.isPending}
        onCerrar={() => setMotivo(null)}
        onConfirmar={(texto) =>
          motivo &&
          anulacion.mutate(
            { id: motivo.plan.id, modo: motivo.modo, motivo: texto },
            {
              onSuccess: () => {
                notifications.show({ color: 'green', title: motivo.modo === 'anular' ? 'Plan anulado' : 'Anulación revertida', message: folio(motivo.plan.id) })
                setMotivo(null)
              },
              onError: (e) => notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
            },
          )
        }
      />
      <TrazasModal
        abierto={trazas !== null}
        entidad="PLAN_MANTENIMIENTO"
        registroId={trazas?.id ?? 0}
        titulo={trazas ? `Trazas de ${folio(trazas.id)}` : ''}
        etiquetas={ETIQUETAS_PLAN}
        onCerrar={() => setTrazas(null)}
      />
    </Stack>
  )
}
