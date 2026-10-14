import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMemo, useState } from 'react'
import { AccionesRegistro, BadgeRegistro } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { usePuedeOperar } from '../../auth/use-puede.ts'
import { useActivos } from '../../inventario/api/activos.ts'
import { BadgeCriticidad } from '../../inventario/componentes/BadgeCriticidad.tsx'
import {
  useCrearPlanes,
  useModificarPlan,
  type Plan,
  type Tablero,
} from '../api/respaldos.ts'
import {
  CRITICIDADES_CRITICAS,
  ESTADO_PLAN,
  FRECUENCIA,
  FRECUENCIA_PRUEBA,
  MEDIO,
  opciones,
  RETENCION,
  TIPO,
  VENTANA,
} from '../catalogos.ts'
import { useAccionesRegistro } from './acciones.tsx'
import { Panel } from './comunes.tsx'
import { folio } from '../folios.ts'

interface Valores {
  frecuencia: string
  tipo: string
  medio: string
  ventana: string
  retencion: string
  frecuenciaPrueba: string
  rpoHoras: number | string
  rtoMinutos: number | string
  responsable: string
  justificacion: string
  estado: string
  motivoCambio: string
}

const VACIO: Valores = {
  frecuencia: '',
  tipo: '',
  medio: '',
  ventana: '',
  retencion: '',
  frecuenciaPrueba: 'TRIMESTRAL',
  rpoHoras: 24,
  rtoMinutos: 240,
  responsable: '',
  justificacion: '',
  estado: 'VIGENTE',
  motivoCambio: '',
}

const requerido = (v: unknown) => (v === '' || v === null || v === undefined ? 'Obligatorio.' : null)
const entero = (min: number) => (v: number | string) =>
  typeof v !== 'number' || !Number.isInteger(v) || v < min ? `Entero mayor o igual que ${min}.` : null

/** Resumen de ventanas del plan, como la columna "Ejecuciones" del prototipo. */
function Cobertura({ plan, tablero }: { plan: Plan; tablero?: Tablero }) {
  const cal = tablero?.calendario.find((c) => c.planId === plan.id)
  if (!cal) return <Text size="xs" c="dimmed">—</Text>
  const ok = cal.ejecucion.filter((w) => w.estado === 'CUMPLIDA').length
  const vencidas = cal.ejecucion.filter((w) => w.estado === 'VENCIDA').length
  const enCurso = cal.ejecucion.filter((w) => w.estado === 'EN_CURSO').length
  const pruebas = cal.prueba.filter((w) => w.estado === 'CUMPLIDA').length
  return (
    <Stack gap={2}>
      <Text size="xs">
        {ok} de {cal.ejecucion.length} ventanas
      </Text>
      {vencidas > 0 ? (
        <Badge size="xs" color="red">{vencidas} omitida(s)</Badge>
      ) : enCurso > 0 ? (
        <Badge size="xs" color="yellow">por reportar</Badge>
      ) : (
        <Badge size="xs" color="green">al día</Badge>
      )}
      <Text size="xs" c="dimmed">
        pruebas: {pruebas} de {cal.prueba.length}
      </Text>
    </Stack>
  )
}

/** Paso 1 · Alcance: qué activos se respaldan y con qué parámetros. */
export function PasoPlan({ planes, tablero }: { planes: Plan[]; tablero?: Tablero }) {
  const puedeOperar = usePuedeOperar()
  const crear = useCrearPlanes()
  const modificar = useModificarPlan()
  const acciones = useAccionesRegistro('planes')
  const [editando, setEditando] = useState<Plan | null>(null)
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [filtro, setFiltro] = useState('')

  // Activos operativos sin plan vigente: los únicos que se pueden incorporar.
  const operativos = useActivos({ operativos: true, limit: 100, page: 1, sort: 'codigo', order: 'asc' })
  const conPlan = new Set(planes.filter((p) => !p.anuladoEn && p.estado === 'VIGENTE').map((p) => p.activoId))
  const sinPlan = useMemo(
    () =>
      (operativos.data?.data ?? [])
        .filter((a) => !conPlan.has(a.id))
        .filter((a) => `${a.codigo} ${a.nombre}`.toLowerCase().includes(filtro.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conPlan se deriva de planes
    [operativos.data, planes, filtro],
  )

  const form = useForm<Valores>({
    initialValues: VACIO,
    validate: {
      frecuencia: requerido,
      tipo: requerido,
      medio: requerido,
      ventana: requerido,
      retencion: requerido,
      frecuenciaPrueba: requerido,
      rpoHoras: entero(1),
      rtoMinutos: entero(1),
      responsable: (v) => (v.trim() ? null : 'Obligatorio.'),
      justificacion: (v) =>
        v.trim().length < 10 ? 'Mínimo 10 caracteres.' : v.length > 300 ? 'Máximo 300 caracteres.' : null,
      motivoCambio: (v) => (editando ? errorMotivo(v) : null),
    },
  })

  const empezarEdicion = (plan: Plan) => {
    setEditando(plan)
    form.setValues({
      ...VACIO,
      frecuencia: plan.frecuencia,
      tipo: plan.tipo,
      medio: plan.medio,
      ventana: plan.ventana,
      retencion: plan.retencion,
      frecuenciaPrueba: plan.frecuenciaPrueba,
      rpoHoras: plan.rpoHoras,
      rtoMinutos: plan.rtoMinutos,
      responsable: plan.responsable,
      justificacion: plan.justificacion,
      estado: plan.estado,
    })
  }
  const cancelar = () => {
    setEditando(null)
    form.setValues(VACIO)
    form.resetDirty()
  }

  const enviar = form.onSubmit((v) => {
    const parametros = {
      frecuencia: v.frecuencia as Plan['frecuencia'],
      tipo: v.tipo as Plan['tipo'],
      medio: v.medio as Plan['medio'],
      ventana: v.ventana as Plan['ventana'],
      retencion: v.retencion as Plan['retencion'],
      frecuenciaPrueba: v.frecuenciaPrueba as Plan['frecuenciaPrueba'],
      rpoHoras: Number(v.rpoHoras),
      rtoMinutos: Number(v.rtoMinutos),
      responsable: v.responsable.trim(),
      justificacion: v.justificacion.trim(),
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    if (editando) {
      modificar.mutate(
        {
          id: editando.id,
          datos: { ...parametros, estado: v.estado as Plan['estado'], motivoCambio: v.motivoCambio.trim() },
        },
        {
          onSuccess: (plan) => {
            notifications.show({ color: 'green', title: 'Plan modificado', message: `${folio('PLN', plan.id)} · versión ${plan.version}` })
            cancelar()
          },
          onError: error,
        },
      )
      return
    }
    if (seleccion.length === 0) {
      notifications.show({ color: 'red', title: 'Seleccione al menos un activo', message: 'Marque los activos a respaldar.' })
      return
    }
    crear.mutate(
      { ...parametros, activoIds: seleccion },
      {
        onSuccess: (creados) => {
          notifications.show({ color: 'green', title: 'Activos incorporados al plan', message: `${creados.length} plan(es) creado(s).` })
          setSeleccion([])
          form.setValues(VACIO)
        },
        onError: error,
      },
    )
  })

  const vigentes = planes.filter((p) => !p.anuladoEn && p.estado === 'VIGENTE').length
  const anulados = planes.filter((p) => p.anuladoEn).length

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, xl: 8 }}>
        <Panel
          titulo="Paso 1 · Activos incluidos en el plan de respaldo"
          control="A.8.13"
          pista={`${vigentes} vigente(s) de ${planes.length}${anulados ? ` · ${anulados} anulado(s)` : ''}`}
        >
          <Table.ScrollContainer minWidth={1100}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th>Activo</Table.Th>
                  <Table.Th>Criticidad</Table.Th>
                  <Table.Th>Frecuencia / prueba</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Medio</Table.Th>
                  <Table.Th>Ventana</Table.Th>
                  <Table.Th>RPO / RTO</Table.Th>
                  <Table.Th>Retención</Table.Th>
                  <Table.Th>Ejecuciones</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Reg.</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {planes.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={13}>
                      <Text c="dimmed" ta="center" py="md">Ningún activo incorporado al plan de respaldo.</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {planes.map((p) => (
                  <Table.Tr key={p.id} style={{ opacity: p.anuladoEn ? 0.55 : 1, textDecoration: p.anuladoEn ? 'line-through' : undefined }}>
                    <Table.Td ff="monospace">{folio('PLN', p.id)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>{p.activo.nombre}</Text>
                      <Text size="xs" c="dimmed">{p.activo.codigo}{p.activo.tipo ? ` · ${p.activo.tipo}` : ''}</Text>
                    </Table.Td>
                    <Table.Td><BadgeCriticidad nivel={p.activo.criticidad} /></Table.Td>
                    <Table.Td>
                      {FRECUENCIA[p.frecuencia]}
                      <Text size="xs" c="dimmed">prueba: {FRECUENCIA_PRUEBA[p.frecuenciaPrueba]}</Text>
                    </Table.Td>
                    <Table.Td>{TIPO[p.tipo]}</Table.Td>
                    <Table.Td>{MEDIO[p.medio]}</Table.Td>
                    <Table.Td>{VENTANA[p.ventana]}</Table.Td>
                    <Table.Td>{p.rpoHoras} h / {p.rtoMinutos} min</Table.Td>
                    <Table.Td>{RETENCION[p.retencion]}</Table.Td>
                    <Table.Td><Cobertura plan={p} tablero={tablero} /></Table.Td>
                    <Table.Td>
                      <Badge size="sm" color={p.estado === 'VIGENTE' ? 'green' : 'gray'} variant="light">
                        {ESTADO_PLAN[p.estado]}
                      </Badge>
                    </Table.Td>
                    <Table.Td><BadgeRegistro registro={p} /></Table.Td>
                    <Table.Td style={{ textDecoration: 'none' }}>
                      <AccionesRegistro
                        registro={p}
                        onModificar={() => empezarEdicion(p)}
                        onAnular={() => acciones.anular(p.id, folio('PLN', p.id))}
                        onReversar={() => acciones.reversar(p.id, folio('PLN', p.id))}
                        onTrazas={() => acciones.verTrazas(p.id, folio('PLN', p.id))}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Panel>
      </Grid.Col>

      <Grid.Col span={{ base: 12, xl: 4 }}>
        <Panel
          titulo={editando ? 'Modificar plan' : 'Seleccionar activos a respaldar'}
          control="A.8.13"
          extra={editando && <Badge color="yellow" variant="light">Modificando {folio('PLN', editando.id)} · v{editando.version}</Badge>}
        >
          {!puedeOperar ? (
            <Alert color="gray">Su perfil es de solo lectura: puede consultar los planes, pero no registrarlos.</Alert>
          ) : (
            <form onSubmit={enviar} noValidate>
              <Stack gap="sm">
                {editando ? (
                  <TextInput
                    label="Activo incluido en el plan"
                    value={`${editando.activo.codigo} · ${editando.activo.nombre}`}
                    disabled
                    description="El activo del plan no se sustituye: anule este plan y cree uno nuevo."
                  />
                ) : (
                  <Stack gap={6}>
                    <Text size="sm" fw={500}>
                      Activos a respaldar <Text span c="red">*</Text>
                    </Text>
                    <Group gap="xs">
                      <Button
                        size="compact-xs"
                        variant="light"
                        onClick={() =>
                          setSeleccion(sinPlan.filter((a) => CRITICIDADES_CRITICAS.includes(a.criticidad.nivel)).map((a) => a.id))
                        }
                      >
                        Seleccionar todos los críticos
                      </Button>
                      <Button size="compact-xs" variant="default" onClick={() => setSeleccion([])}>
                        Limpiar
                      </Button>
                      <Text size="xs" c="dimmed">{seleccion.length} seleccionado(s)</Text>
                    </Group>
                    <TextInput size="xs" placeholder="Filtrar por código o nombre…" value={filtro} onChange={(e) => setFiltro(e.currentTarget.value)} />
                    {sinPlan.length === 0 ? (
                      <Text size="sm" c="dimmed">Todos los activos operativos ya cuentan con un plan de respaldo.</Text>
                    ) : (
                      <ScrollArea.Autosize mah={220} type="auto">
                        <Stack gap={4}>
                          {sinPlan.map((a) => (
                            <Checkbox
                              key={a.id}
                              checked={seleccion.includes(a.id)}
                              onChange={(e) =>
                                setSeleccion((s) => (e.currentTarget.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))
                              }
                              label={
                                <Group gap={6} wrap="nowrap">
                                  <Text size="sm">{a.nombre}</Text>
                                  <BadgeCriticidad nivel={a.criticidad.nivel} />
                                </Group>
                              }
                              description={`${a.codigo}${a.tipo ? ` · ${a.tipo}` : ''} · ${a.custodio}`}
                            />
                          ))}
                        </Stack>
                      </ScrollArea.Autosize>
                    )}
                    <Text size="xs" c="dimmed">
                      Solo se listan los activos operativos que aún no tienen plan. Los parámetros siguientes se aplican a todos los seleccionados.
                    </Text>
                  </Stack>
                )}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select label="Frecuencia" required data={opciones(FRECUENCIA)} {...form.getInputProps('frecuencia')} />
                  <Select label="Tipo de respaldo" required data={opciones(TIPO)} {...form.getInputProps('tipo')} />
                  <Select label="Medio de almacenamiento" required data={opciones(MEDIO)} {...form.getInputProps('medio')} />
                  <Select label="Ventana de ejecución" required data={opciones(VENTANA)} {...form.getInputProps('ventana')} />
                  <Select label="Período de retención" required data={opciones(RETENCION)} {...form.getInputProps('retencion')} />
                  <Select label="Frecuencia de prueba de restauración" required data={opciones(FRECUENCIA_PRUEBA)} {...form.getInputProps('frecuenciaPrueba')} />
                  <NumberInput label="RPO comprometido (h)" required min={1} allowDecimal={false} {...form.getInputProps('rpoHoras')} />
                  <NumberInput label="RTO objetivo (min)" required min={1} allowDecimal={false} {...form.getInputProps('rtoMinutos')} />
                  <TextInput label="Responsable" required placeholder="Coordinación de Infraestructura" {...form.getInputProps('responsable')} />
                  {editando && (
                    <Select label="Estado del plan" required data={opciones(ESTADO_PLAN)} {...form.getInputProps('estado')} />
                  )}
                </SimpleGrid>
                <Textarea
                  label="Justificación del alcance"
                  required
                  autosize
                  minRows={2}
                  maxLength={300}
                  placeholder="Necesidad de continuidad, criticidad y clasificación de la información que sustenta la inclusión."
                  {...form.getInputProps('justificacion')}
                />
                {editando && (
                  <Textarea
                    label="Motivo del cambio"
                    required
                    autosize
                    minRows={2}
                    maxLength={300}
                    placeholder="Indique por qué se modifica el registro y la evidencia que lo respalda (mínimo 20 caracteres)."
                    description="Se conserva la versión anterior; el cambio queda en las trazas."
                    {...form.getInputProps('motivoCambio')}
                  />
                )}
                <Group gap="sm">
                  <Button type="submit" loading={crear.isPending || modificar.isPending}>
                    {editando ? 'Guardar cambios' : 'Incorporar al plan de respaldo'}
                  </Button>
                  {editando && <Button variant="default" onClick={cancelar}>Cancelar</Button>}
                </Group>
                <Text size="xs" c="dimmed">
                  {editando ? 'Se conserva la versión anterior del plan.' : 'Se genera un plan por cada activo seleccionado.'}
                </Text>
              </Stack>
            </form>
          )}
        </Panel>
      </Grid.Col>
      {acciones.modales}
    </Grid>
  )
}
