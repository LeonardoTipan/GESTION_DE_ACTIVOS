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
import { Cifra, PanelTablero } from '../../../shared/components/Tablero.tsx'
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
import type { Activo } from '../../inventario/api/activos.ts'
import { SeleccionActivos } from '../../inventario/componentes/SeleccionActivos.tsx'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import {
  useAnulacionPlanMantenimiento,
  useCrearPlanesMantenimiento,
  useModificarPlanMantenimiento,
  usePlanesMantenimiento,
  useProgramarDesdePlan,
  useTableroMantenimientos,
  type ClaseMantenimiento,
  type FrecuenciaMantenimiento,
  type PlanMantenimiento,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { etiquetaSemestre, FRECUENCIAS, INFO_CLASE, INFO_FRECUENCIA, INFO_TIPO, TIPOS, tiposPermitidos } from '../fases.ts'
import { BadgeClase, BadgeTipo } from './Badges.tsx'

const ETIQUETAS_PLAN: Record<string, string> = {
  tipo: 'Tipo',
  frecuencia: 'Período',
  fechaInicio: 'Fecha de inicio planificada',
  proximaFecha: 'Próxima fecha',
  plazoDias: 'Plazo (días)',
  responsable: 'Asignado',
  actividades: 'Descripción planificada',
  estado: 'Estado',
}

const AÑO_ACTUAL = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => String(AÑO_ACTUAL + 1 - i))

const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`

/** Tablero de la capa 1: cifras y calendario de los próximos 60 días. */
function Tablero() {
  const { data, isPending, error } = useTableroMantenimientos()
  if (error) return <Alert color="red">{error.message}</Alert>
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
        <Cifra titulo="Próximas intervenciones" valor={data?.proximas.length} pista="Planes y programados en 60 días" />
        <Cifra titulo="Activos sin plan preventivo" valor={data?.activosSinPlan} color="orange" pista="Operativos, sin plan vigente" />
        <Cifra titulo="Planes vencidos" valor={data?.planesVencidos} color="red" pista="Próxima fecha ya pasada" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <PanelTablero titulo="Calendario · próximos 60 días">
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
        </PanelTablero>
        <PanelTablero titulo="Activos operativos sin plan preventivo">
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
        </PanelTablero>
      </SimpleGrid>
    </Stack>
  )
}

interface ValoresPlan {
  tipo: TipoMantenimiento
  frecuencia: FrecuenciaMantenimiento
  fechaInicio: string | null
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
    <Modal opened={abierto} onClose={onCerrar} size="xl" title={plan ? `Modificar ${folio(plan.id)} · v${plan.version}` : 'Nueva planificación de mantenimiento'}>
      {abierto && <FormPlan plan={plan} onCerrar={onCerrar} />}
    </Modal>
  )
}

function FormPlan({ plan, onCerrar }: { plan: PlanMantenimiento | null; onCerrar: () => void }) {
  const crear = useCrearPlanesMantenimiento()
  const modificar = useModificarPlanMantenimiento()
  const [seleccion, setSeleccion] = useState<number[]>([])
  // Activos elegidos con sus datos: su categoría dice si son hardware (físico) o software (lógico).
  const [elegidos, setElegidos] = useState<Activo[]>([])
  const vigentes = usePlanesMantenimiento({ estado: 'VIGENTE', page: 1, limit: 100 })
  const categorias = useCategorias()
  const claseDe = (categoriaId: number): ClaseMantenimiento | null =>
    categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null

  const form = useForm<ValoresPlan>({
    initialValues: plan
      ? {
          tipo: plan.tipo,
          frecuencia: plan.frecuencia,
          fechaInicio: isoAFechaHoraLocal(plan.fechaInicio),
          proximaFecha: plan.proximaFecha ? isoAFechaHoraLocal(plan.proximaFecha) : null,
          plazoDias: plan.plazoDias ?? 7,
          responsable: plan.responsable,
          actividades: plan.actividades,
          estado: plan.estado,
          motivoCambio: '',
        }
      : { tipo: 'PREVENTIVO', frecuencia: 'SEMESTRAL', fechaInicio: null, proximaFecha: null, plazoDias: 7, responsable: '', actividades: '', estado: 'VIGENTE', motivoCambio: '' },
    validate: {
      tipo: (v) => (clase !== undefined && !tiposPermitidos(clase).includes(v) ? 'Este tipo no corresponde a la clase del activo' : null),
      fechaInicio: (v) => (v ? null : 'Indica la fecha de inicio planificada'),
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
      fechaInicio: fechaHoraLocalAIso(v.fechaInicio!),
      // Al crear, la primera intervención es la fecha de inicio; al modificar se puede mover.
      ...(plan && v.proximaFecha ? { proximaFecha: fechaHoraLocalAIso(v.proximaFecha) } : {}),
      plazoDias: Number(v.plazoDias),
      responsable: v.responsable.trim(),
      actividades: v.actividades.trim(),
    }
    if (plan) {
      modificar.mutate(
        { id: plan.id, datos: { ...parametros, estado: v.estado, motivoCambio: v.motivoCambio.trim() } },
        {
          onSuccess: (p) => {
            notifications.show({ color: 'green', title: 'Planificación modificada', message: `${folio(p.id)} · versión ${p.version}` })
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
    if (mezcla) {
      notifications.show({ color: 'red', title: 'Activos de distinta clase', message: 'Una planificación agrupa solo activos de hardware o solo de software.' })
      return
    }
    crear.mutate(
      { ...parametros, activoIds: seleccion },
      {
        onSuccess: (creados) => {
          notifications.show({ color: 'green', title: 'Planificaciones creadas', message: `${creados.length} planificación(es) de mantenimiento.` })
          onCerrar()
        },
        onError: error,
      },
    )
  })

  const conPlanDelTipo = new Set(
    (vigentes.data?.data ?? []).filter((p) => !p.anuladoEn && p.tipo === form.values.tipo).map((p) => p.activoId),
  )
  // Clase de la planificación: la del activo (al modificar) o la del primer activo elegido
  // (undefined = aún no se eligió ninguno). Decide los tipos que se ofrecen.
  const clase: ClaseMantenimiento | null | undefined = plan
    ? claseDe(plan.activo.categoriaId)
    : elegidos.length > 0
      ? claseDe(elegidos[0].categoriaId)
      : undefined
  const tipos = clase === undefined ? [] : tiposPermitidos(clase)
  const mezcla = new Set(elegidos.map((a) => claseDe(a.categoriaId))).size > 1
  const etiquetaClase = (c: ClaseMantenimiento | null) => (c ? INFO_CLASE[c].toLowerCase() : 'sin clasificar')
  const alElegir = (activos: Activo[]) => {
    setElegidos(activos)
    const nueva = activos.length > 0 ? claseDe(activos[0].categoriaId) : undefined
    // Si el tipo elegido no vale para la nueva clase, vuelve a uno común a todas.
    if (nueva !== undefined && !tiposPermitidos(nueva).includes(form.values.tipo)) form.setFieldValue('tipo', 'PREVENTIVO')
  }
  const duplicados = elegidos.filter((a) => conPlanDelTipo.has(a.id))
  const semestre = form.values.fechaInicio ? etiquetaSemestre(form.values.fechaInicio.slice(0, 10)) : null
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {plan ? (
          <Group gap="sm" align="flex-end" wrap="nowrap">
            <TextInput
              label="Activo"
              value={`${plan.activo.codigo} · ${plan.activo.nombre}`}
              disabled
              description="El activo no se sustituye: anule la planificación y cree otra."
              style={{ flex: 1 }}
            />
            <BadgeClase clase={clase ?? null} size="lg" />
          </Group>
        ) : (
          <SeleccionActivos
            titulo="Seleccionar activos para mantenimiento"
            etiqueta="Activos"
            value={seleccion}
            onChange={setSeleccion}
            onElegidos={alElegir}
            insignia={(a) => <BadgeClase clase={claseDe(a.categoriaId)} size="xs" />}
            // Reglas del módulo: todos los activos de una planificación son de la misma clase
            // (hardware o software) y no tienen ya una planificación vigente de ese tipo.
            noElegible={(a) => {
              const suya = claseDe(a.categoriaId)
              if (clase !== undefined && suya !== clase) {
                return `Es ${etiquetaClase(suya)}; esta planificación es de ${etiquetaClase(clase)}.`
              }
              if (conPlanDelTipo.has(a.id)) return `Ya tiene una planificación ${INFO_TIPO[form.values.tipo].etiqueta.toLowerCase()} vigente.`
              return null
            }}
            error={mezcla ? 'Hay activos de distinta clase: deje solo los de hardware o solo los de software.' : undefined}
            ayuda="Elija primero los activos: su clase (hardware o software) decide los tipos de mantenimiento. Solo se ofrecen activos operativos (también en condición «Malo»)."
          />
        )}
        {!plan && (
          <Card withBorder padding="xs">
            <Group gap="sm">
              <Text size="sm" fw={500}>
                Clase del activo:
              </Text>
              {clase === undefined ? (
                <Text size="sm" c="dimmed">
                  elija un activo
                </Text>
              ) : (
                <>
                  <BadgeClase clase={clase} />
                  <Text size="xs" c="dimmed">
                    Tipos permitidos: {tipos.map((t) => INFO_TIPO[t].etiqueta).join(', ')}
                  </Text>
                </>
              )}
            </Group>
          </Card>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Tipo de mantenimiento"
            withAsterisk
            placeholder={clase === undefined ? 'Elija primero el activo' : undefined}
            disabled={clase === undefined}
            description={
              clase === 'HARDWARE'
                ? 'Hardware (físico): preventivo, correctivo, predictivo'
                : clase === 'SOFTWARE'
                  ? 'Software (lógico): preventivo, correctivo, perfectivo, adaptativo, evolutivo'
                  : clase === null
                    ? 'Categoría sin clasificar: solo preventivo y correctivo (el admin la clasifica en Catálogos)'
                    : 'Depende de la clase del activo'
            }
            data={tipos.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
            value={clase === undefined ? null : form.values.tipo}
            onChange={(v) => v && form.setFieldValue('tipo', v as TipoMantenimiento)}
            error={
              form.errors.tipo ??
              (duplicados.length > 0
                ? `Ya tienen una planificación ${INFO_TIPO[form.values.tipo].etiqueta.toLowerCase()} vigente: ${duplicados.map((a) => a.codigo).join(', ')}`
                : undefined)
            }
            allowDeselect={false}
          />
          <Select
            label="Período"
            withAsterisk
            description="Cada cuánto se repite (Única vez = una sola intervención)"
            data={FRECUENCIAS.map((f) => ({ value: f, label: INFO_FRECUENCIA[f] }))}
            allowDeselect={false}
            {...form.getInputProps('frecuencia')}
          />
          <DateTimePicker
            label="Fecha de inicio planificada"
            description={semestre ? `Semestre planificado: ${semestre} (S1 ene–jun · S2 jul–dic)` : 'De ella salen el año y el semestre planificados'}
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            {...form.getInputProps('fechaInicio')}
          />
          {plan && (
            <DateTimePicker
              label="Próxima intervención"
              description="La que se generará al pulsar «Nueva ejecución»"
              valueFormat="DD MMM YYYY HH:mm"
              clearable
              {...form.getInputProps('proximaFecha')}
            />
          )}
          <NumberInput
            label="Plazo de cada intervención (días)"
            description="Fecha límite = inicio previsto + plazo"
            withAsterisk
            min={1}
            max={365}
            allowDecimal={false}
            {...form.getInputProps('plazoDias')}
          />
          <TextInput label="Asignado" description="Quién debe realizarlo" withAsterisk placeholder="Soporte TIC" {...form.getInputProps('responsable')} />
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
          label="Descripción planificada"
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
            {plan ? 'Guardar cambios' : `Crear ${seleccion.length || ''} planificación(es)`}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/**
 * Ejecución ADICIONAL de una planificación (intervención parcial, trabajo extra o
 * reprogramación): en la fecha que se indique y sin mover la próxima del período.
 */
function EjecucionAdicionalModal({ plan, onCerrar }: { plan: PlanMantenimiento | null; onCerrar: () => void }) {
  const programar = useProgramarDesdePlan()
  const [fecha, setFecha] = useState<string | null>(null)
  const cerrar = () => {
    setFecha(null)
    onCerrar()
  }
  return (
    <Modal opened={plan !== null} onClose={cerrar} title={plan ? `Ejecución adicional · ${folio(plan.id)}` : ''}>
      {plan && (
        <Stack gap="sm">
          <Text size="sm">
            {plan.activo.codigo} · {plan.activo.nombre} — {INFO_TIPO[plan.tipo].etiqueta}, {INFO_FRECUENCIA[plan.frecuencia].toLowerCase()}
          </Text>
          <DateTimePicker
            label="Inicio previsto de la ejecución"
            description={`Plazo: ${plan.plazoDias} día(s). No cambia la próxima fecha del período.`}
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            value={fecha}
            onChange={setFecha}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!fecha}
              loading={programar.isPending}
              onClick={() =>
                fecha &&
                programar.mutate(
                  { id: plan.id, datos: { adicional: true, fecha: fechaHoraLocalAIso(fecha) } },
                  {
                    onSuccess: (r) => {
                      notifications.show({ color: 'green', title: `Ejecución #${r.mantenimientoId} creada (pendiente)`, message: 'Ejecución adicional de la planificación.' })
                      cerrar()
                    },
                    onError: (e) => notifications.show({ color: 'red', title: 'No se pudo crear la ejecución', message: e.message }),
                  },
                )
              }
            >
              Crear ejecución
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
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
    anio?: number
    semestre?: 1 | 2
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
    anio: filtros.anio,
    semestre: filtros.anio ? filtros.semestre : undefined,
    q: q || undefined,
  })
  const programar = useProgramarDesdePlan()
  const [adicional, setAdicional] = useState<PlanMantenimiento | null>(null)
  const anulacion = useAnulacionPlanMantenimiento()
  const [modal, setModal] = useState<{ plan: PlanMantenimiento | null } | null>(null)
  const [motivo, setMotivo] = useState<{ plan: PlanMantenimiento; modo: ModoMotivo } | null>(null)
  const [trazas, setTrazas] = useState<PlanMantenimiento | null>(null)
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))

  const programarPlan = (p: PlanMantenimiento) =>
    programar.mutate({ id: p.id }, {
      onSuccess: (r) =>
        notifications.show({
          color: 'green',
          title: `Ejecución #${r.mantenimientoId} creada (pendiente)`,
          message: r.plan.proximaFecha
            ? `Siguiente intervención del período: ${formatearDia(r.plan.proximaFecha)}.`
            : 'Era una planificación de una sola vez: no quedan intervenciones del período.',
        }),
      onError: (e) => notifications.show({ color: 'red', title: 'No se pudo programar', message: e.message }),
    })

  return (
    <Stack gap="md">
      <Tablero />
      <Group justify="space-between" align="flex-end">
        <Title order={4}>Planificaciones de mantenimiento</Title>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ plan: null })}>
            Nueva planificación
          </Button>
        )}
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar"
          placeholder="Activo, categoría, asignado…"
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
        <Select
          label="Año planificado"
          placeholder="Todos"
          clearable
          data={AÑOS}
          value={filtros.anio ? String(filtros.anio) : null}
          onChange={(v) => cambiar({ anio: v ? Number(v) : undefined, semestre: v ? filtros.semestre : undefined })}
          w={{ base: '100%', sm: 130 }}
        />
        <Select
          label="Semestre"
          placeholder={filtros.anio ? 'Ambos' : 'Elija el año'}
          clearable
          disabled={!filtros.anio}
          data={[
            { value: '1', label: 'S1 (ene–jun)' },
            { value: '2', label: 'S2 (jul–dic)' },
          ]}
          value={filtros.semestre ? String(filtros.semestre) : null}
          onChange={(v) => cambiar({ semestre: v ? (Number(v) as 1 | 2) : undefined })}
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
            {filtros.q || filtros.tipo || filtros.estado || filtros.categoriaId || filtros.vencidos || filtros.anio
              ? 'Ninguna planificación coincide con los filtros.'
              : 'Todavía no hay planificaciones de mantenimiento.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={1450}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Planificación</Table.Th>
                  <Table.Th>Activo</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Período</Table.Th>
                  <Table.Th>Inicio planificado</Table.Th>
                  <Table.Th>Próxima</Table.Th>
                  <Table.Th>Asignado</Table.Th>
                  <Table.Th>Ejecuciones</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Reg.</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {planes.data?.data.map((p) => {
                  const vigente = puedeOperar && !p.anuladoEn && p.estado === 'VIGENTE'
                  const programable = vigente && p.proximaFecha !== null
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
                        <BadgeClase clase={categorias.data?.find((c) => c.id === p.activo.categoriaId)?.claseMantenimiento ?? null} size="xs" />
                      </Table.Td>
                      <Table.Td>
                        <BadgeTipo tipo={p.tipo} />
                      </Table.Td>
                      <Table.Td>{INFO_FRECUENCIA[p.frecuencia]}</Table.Td>
                      <Table.Td>
                        {formatearDia(p.fechaInicio)}
                        <Badge size="xs" variant="outline" ml={6}>
                          {p.semestrePlanificado.etiqueta}
                        </Badge>
                      </Table.Td>
                      <Table.Td c={p.vencido ? 'red' : undefined} fw={p.vencido ? 600 : undefined}>
                        {p.proximaFecha ? formatearFechaHora(p.proximaFecha) : '— (concluido)'}
                      </Table.Td>
                      <Table.Td>{p.responsable}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/mantenimientos?planId=${p.id}`} size="sm" title="Completadas / todas">
                          {p.ejecucionesCompletadas} / {p.intervenciones}
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
                              loading={programar.isPending && programar.variables?.id === p.id}
                              onClick={() => programarPlan(p)}
                              title="Crea la ejecución de la próxima fecha y adelanta el período"
                            >
                              Nueva ejecución
                            </Button>
                          )}
                          {vigente && (
                            <Button size="compact-xs" variant="light" color="teal" onClick={() => setAdicional(p)} title="Otra ejecución en la fecha que elija; no mueve la próxima fecha">
                              Adicional
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
      <EjecucionAdicionalModal plan={adicional} onCerrar={() => setAdicional(null)} />
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
