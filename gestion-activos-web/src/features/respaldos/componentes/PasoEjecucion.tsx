import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  NumberInput,
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
import { DateTimePicker } from '@mantine/dates'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Calendario as Agenda } from '../../../shared/calendario/Calendario.tsx'
import { ahoraLocal, fechaHoraLocalAIso, formatearFechaHora, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { AmpliarPlazoModal, CampoExcepcion, VentanaModal } from '../../../shared/plazos/componentes.tsx'
import { fmt, errorExcepcion } from '../../../shared/plazos/plazos.ts'
import { AccionesRegistro, BadgeRegistro } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../auth/use-puede.ts'
import {
  useAmpliarPlazoPrueba,
  useModificarEjecucion,
  useProgramarPrueba,
  useRegistrarEjecucion,
  type Ejecucion,
  type Plan,
  type Tablero,
  type VentanaCalendario,
} from '../api/respaldos.ts'
import {
  COLOR_RESULTADO,
  controlesEjecucion,
  FRECUENCIA,
  MEDIO,
  opciones,
  RESULTADO,
  TIPO,
  VENTANA,
} from '../catalogos.ts'
import { useAccionesRegistro } from './acciones.tsx'
import { Calendario, Panel } from './comunes.tsx'
import { dentroDeVentana, fechaDeVentana, folio, HORA_SUGERIDA } from '../folios.ts'

const hoy = () => dayjs().format('YYYY-MM-DD')
/** Una fecha real no puede ser futura (5 min de margen, como la API). */
const esFutura = (f: string) => dayjs(f).isAfter(dayjs().add(5, 'minute'))

interface Valores {
  planId: string
  fecha: string
  tipo: string
  medio: string
  volumenGb: number | string
  duracionMin: number | string
  rpoHoras: number | string
  resultado: string
  responsable: string
  cifrado: boolean
  fueraSitio: boolean
  inmutable: boolean
  integridad: boolean
  evidencia: string
  observaciones: string
  motivoCambio: string
  motivoExcepcion: string
  pruebaPrevista: string | null
  pruebaLimite: string | null
}

const VACIO: Valores = {
  planId: '',
  fecha: '',
  tipo: '',
  medio: '',
  volumenGb: 100,
  duracionMin: 60,
  rpoHoras: 24,
  resultado: '',
  responsable: '',
  cifrado: true,
  fueraSitio: true,
  inmutable: false,
  integridad: true,
  evidencia: '',
  observaciones: '',
  motivoCambio: '',
  motivoExcepcion: '',
  pruebaPrevista: null,
  pruebaLimite: null,
}

const requerido = (v: unknown) => (v === '' || v === null || v === undefined ? 'Obligatorio.' : null)
const entero = (min: number) => (v: number | string) =>
  typeof v !== 'number' || !Number.isInteger(v) || v < min ? `Entero mayor o igual que ${min}.` : null

/** Paso 2 · Ejecución: cada corrida del respaldo sobre un activo con plan vigente. */
export function PasoEjecucion({
  planes,
  ejecuciones,
  tablero,
  etiquetaPeriodo,
}: {
  planes: Plan[]
  ejecuciones: Ejecucion[]
  tablero?: Tablero
  etiquetaPeriodo: string
}) {
  const puedeOperar = usePuedeOperar()
  const registrar = useRegistrarEjecucion()
  const modificar = useModificarEjecucion()
  const acciones = useAccionesRegistro('ejecuciones')
  const [editando, setEditando] = useState<Ejecucion | null>(null)
  const [ventana, setVentana] = useState<{ planId: number; ventana: VentanaCalendario } | null>(null)
  const vigentes = planes.filter((p) => !p.anuladoEn && p.estado === 'VIGENTE')
  const admin = usePuedeAdministrar()

  /** Por qué la hora real queda fuera del plan (antes de su inicio o de su ventana), como en la API; o null. */
  const fueraDelPlan = (v: Pick<Valores, 'planId' | 'fecha'>): string | null => {
    const plan = planes.find((p) => String(p.id) === v.planId)
    if (!plan || !v.fecha) return null
    const inicio = dayjs(plan.vigenteDesde).format('YYYY-MM-DD')
    if (dayjs(v.fecha).format('YYYY-MM-DD') < inicio) return `La ejecución es anterior al inicio previsto del plan (${inicio}).`
    if (!dentroDeVentana(plan.ventana, dayjs(v.fecha).toDate())) return `La ejecución está fuera de la ventana ${VENTANA[plan.ventana].toLowerCase()} del plan.`
    return null
  }
  /** Al modificar, solo se reevalúa si la fecha cambia (como en la API). */
  const fechaCambiada = (fecha: string) => !editando || !dayjs(fecha).isSame(dayjs(editando.fecha))

  const form = useForm<Valores>({
    initialValues: { ...VACIO, fecha: ahoraLocal() },
    validate: {
      planId: (v) => (editando ? null : requerido(v)),
      fecha: (f, v) =>
        !f
          ? 'Obligatorio.'
          : esFutura(f)
            ? 'No puede ser futura.'
            : editando && !admin && fechaCambiada(f) && fueraDelPlan(v)
              ? 'Fuera del plan: solo un administrador puede corregirla a esta fecha.'
              : null,
      motivoExcepcion: (m, v) => (editando ? null : errorExcepcion(fueraDelPlan(v), m)),
      pruebaPrevista: (p, v) =>
        !p && v.pruebaLimite
          ? 'Indique también el inicio previsto.'
          : p && v.fecha && dayjs(p).isBefore(dayjs(v.fecha))
            ? 'No puede ser anterior a la ejecución.'
            : null,
      pruebaLimite: (l, v) =>
        !l && v.pruebaPrevista
          ? 'Indique también el límite.'
          : l && v.pruebaPrevista && dayjs(l).isBefore(dayjs(v.pruebaPrevista))
            ? 'No puede ser anterior al inicio previsto.'
            : null,
      tipo: requerido,
      medio: requerido,
      resultado: requerido,
      volumenGb: entero(0),
      duracionMin: entero(0),
      rpoHoras: entero(1),
      responsable: (v) => (v.trim() ? null : 'Obligatorio.'),
      evidencia: (v) => (v.length > 191 ? 'Máximo 191 caracteres.' : null),
      observaciones: (v) => (v.length > 2000 ? 'Máximo 2000 caracteres.' : null),
      motivoCambio: (v) => (editando ? errorMotivo(v) : null),
    },
  })

  /** Al elegir un plan se cargan sus parámetros comprometidos. */
  const cargarPlan = (planId: string | null) => {
    const plan = vigentes.find((p) => String(p.id) === planId)
    form.setFieldValue('planId', planId ?? '')
    if (plan) {
      form.setValues({ tipo: plan.tipo, medio: plan.medio, rpoHoras: plan.rpoHoras, responsable: plan.responsable })
    }
  }

  const seleccionarVentana = (planId: number, w: VentanaCalendario) => {
    setEditando(null)
    setVentana({ planId, ventana: w })
    const plan = vigentes.find((p) => p.id === planId)
    const dia = fechaDeVentana(w, hoy())
    form.setValues({ ...VACIO, fecha: `${dia} ${plan ? HORA_SUGERIDA[plan.ventana] : '09:00'}:00` })
    cargarPlan(String(planId))
  }

  const empezarEdicion = (e: Ejecucion) => {
    setVentana(null)
    setEditando(e)
    form.setValues({
      ...VACIO,
      planId: String(e.planId),
      fecha: isoAFechaHoraLocal(e.fecha),
      tipo: e.tipo,
      medio: e.medio,
      volumenGb: e.volumenGb,
      duracionMin: e.duracionMin,
      rpoHoras: e.rpoHoras,
      resultado: e.resultado,
      responsable: e.responsable,
      cifrado: e.cifrado,
      fueraSitio: e.fueraSitio,
      inmutable: e.inmutable,
      integridad: e.integridad,
      evidencia: e.evidencia ?? '',
      observaciones: e.observaciones ?? '',
    })
  }
  const limpiar = () => {
    setEditando(null)
    setVentana(null)
    form.setValues({ ...VACIO, fecha: ahoraLocal() })
  }

  const enviar = form.onSubmit((v) => {
    const datos = {
      fecha: fechaHoraLocalAIso(v.fecha),
      tipo: v.tipo as Ejecucion['tipo'],
      medio: v.medio as Ejecucion['medio'],
      volumenGb: Number(v.volumenGb),
      duracionMin: Number(v.duracionMin),
      rpoHoras: Number(v.rpoHoras),
      resultado: v.resultado as Ejecucion['resultado'],
      responsable: v.responsable.trim(),
      cifrado: v.cifrado,
      fueraSitio: v.fueraSitio,
      inmutable: v.inmutable,
      integridad: v.integridad,
      evidencia: v.evidencia.trim() || undefined,
      observaciones: v.observaciones.trim() || undefined,
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    if (editando) {
      modificar.mutate(
        { id: editando.id, datos: { ...datos, fecha: fechaCambiada(v.fecha) ? datos.fecha : undefined, motivoCambio: v.motivoCambio.trim() } },
        {
          onSuccess: (e) => {
            notifications.show({ color: 'green', title: 'Respaldo modificado', message: `${folio('RES', e.id)} · versión ${e.version}` })
            limpiar()
          },
          onError: error,
        },
      )
      return
    }
    registrar.mutate(
      {
        ...datos,
        planId: Number(v.planId),
        motivoExcepcion: fueraDelPlan(v) ? v.motivoExcepcion.trim() : undefined,
        pruebaPrevista: v.pruebaPrevista ? fechaHoraLocalAIso(v.pruebaPrevista) : undefined,
        pruebaLimite: v.pruebaLimite ? fechaHoraLocalAIso(v.pruebaLimite) : undefined,
      },
      {
        onSuccess: (e) => {
          notifications.show({ color: 'green', title: 'Respaldo registrado', message: `${folio('RES', e.id)} · ${e.activo.nombre}` })
          limpiar()
        },
        onError: error,
      },
    )
  })

  return (
    <Stack gap="md">
      <Calendario
        tablero={tablero}
        tipo="ejecucion"
        titulo="Calendario de ejecución programada"
        control="A.8.13"
        explicacion="Cada plan despliega las ventanas que le corresponden según su frecuencia. Pulse una ventana para registrar su ejecución con la fecha y el activo ya cargados."
        onSeleccionar={seleccionarVentana}
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, xl: 8 }}>
          <Panel titulo="Paso 2 · Respaldos ejecutados" control="A.8.13" pista={`${ejecuciones.length} ejecución(es) en ${etiquetaPeriodo}`}>
            <Table.ScrollContainer minWidth={1100}>
              <Table striped verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Folio</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Activo</Table.Th>
                    <Table.Th>Plan</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Medio</Table.Th>
                    <Table.Th>GB</Table.Th>
                    <Table.Th>Min</Table.Th>
                    <Table.Th>RPO</Table.Th>
                    <Table.Th>Controles</Table.Th>
                    <Table.Th>Resultado</Table.Th>
                    <Table.Th>Reg.</Table.Th>
                    <Table.Th>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {ejecuciones.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={13}>
                        <Text c="dimmed" ta="center" py="md">Sin respaldos registrados en el período.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {ejecuciones.map((e) => {
                    const controles = controlesEjecucion(e)
                    return (
                      <Table.Tr key={e.id} style={{ opacity: e.anuladoEn ? 0.55 : 1 }}>
                        <Table.Td ff="monospace" td={e.anuladoEn ? 'line-through' : undefined}>{folio('RES', e.id)}</Table.Td>
                        <Table.Td>
                          {formatearFechaHora(e.fecha)}
                          {e.fueraDePlazo && (
                            <Text size="xs" c="orange" title={`${e.motivoExcepcion ?? ''} (autorizó ${e.excepcionPor ?? '—'})`}>
                              ⚠ fuera del plan
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {e.activo.nombre}
                          <Text size="xs" c="dimmed">{e.activo.categoria}</Text>
                        </Table.Td>
                        <Table.Td ff="monospace">{folio('PLN', e.planId)}</Table.Td>
                        <Table.Td>{TIPO[e.tipo]}</Table.Td>
                        <Table.Td>{MEDIO[e.medio]}</Table.Td>
                        <Table.Td>{e.volumenGb}</Table.Td>
                        <Table.Td>{e.duracionMin}</Table.Td>
                        <Table.Td>{e.rpoHoras} h</Table.Td>
                        <Table.Td>
                          {controles.length ? (
                            <Group gap={4}>
                              {controles.map((c) => <Badge key={c} size="xs" variant="outline">{c}</Badge>)}
                            </Group>
                          ) : (
                            <Badge size="xs" color="red">sin controles</Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" color={COLOR_RESULTADO[e.resultado]} variant="light">{RESULTADO[e.resultado]}</Badge>
                          {e.evidencia && <Text size="xs" c="dimmed">evid.: {e.evidencia}</Text>}
                          {e.observaciones && <Text size="xs" c="dimmed" lineClamp={2}>{e.observaciones}</Text>}
                          <PruebaPrevista ejecucion={e} />
                        </Table.Td>
                        <Table.Td><BadgeRegistro registro={e} /></Table.Td>
                        <Table.Td>
                          <AccionesRegistro
                            registro={e}
                            onModificar={() => empezarEdicion(e)}
                            onAnular={() => acciones.anular(e.id, folio('RES', e.id))}
                            onReversar={() => acciones.reversar(e.id, folio('RES', e.id))}
                            onTrazas={() => acciones.verTrazas(e.id, folio('RES', e.id))}
                          />
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Panel>
        </Grid.Col>

        <Grid.Col span={{ base: 12, xl: 4 }}>
          <Panel
            titulo={editando ? 'Modificar respaldo' : 'Registrar ejecución de respaldo'}
            control="A.8.13"
            extra={editando && <Badge color="yellow" variant="light">Modificando {folio('RES', editando.id)} · v{editando.version}</Badge>}
          >
            {!puedeOperar ? (
              <Alert color="gray">Su perfil es de solo lectura.</Alert>
            ) : vigentes.length === 0 && !editando ? (
              <Alert color="blue" title="Aún no hay activos en el plan de respaldo">
                Vuelva al paso 1 y seleccione los activos a respaldar: la ejecución solo se registra sobre un activo con plan vigente.
              </Alert>
            ) : (
              <form onSubmit={enviar} noValidate>
                <Stack gap="sm">
                  {ventana && (
                    <Alert color="blue" withCloseButton onClose={limpiar} title={`Registrando la ventana ${ventana.ventana.etiqueta}`}>
                      Del {ventana.ventana.ini} al {ventana.ventana.fin}.
                    </Alert>
                  )}
                  {editando ? (
                    <TextInput label="Activo del plan" value={`${editando.activo.nombre} · ${folio('PLN', editando.planId)}`} disabled />
                  ) : (
                    <Select
                      label="Activo del plan a respaldar"
                      required
                      searchable
                      description="Los parámetros comprometidos se cargan desde el plan."
                      data={vigentes.map((p) => ({
                        value: String(p.id),
                        label: `${p.activo.nombre} · ${folio('PLN', p.id)} · ${FRECUENCIA[p.frecuencia]}`,
                      }))}
                      {...form.getInputProps('planId')}
                      onChange={cargarPlan}
                    />
                  )}
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <DateTimePicker
                      label="Fecha y hora real de ejecución"
                      description="Hora local; se compara con la ventana del plan"
                      valueFormat="DD MMM YYYY HH:mm"
                      required
                      maxDate={new Date()}
                      {...form.getInputProps('fecha')}
                    />
                    <Select label="Tipo de respaldo" required data={opciones(TIPO)} {...form.getInputProps('tipo')} />
                    <Select label="Medio de almacenamiento" required data={opciones(MEDIO)} {...form.getInputProps('medio')} />
                    <NumberInput label="Volumen (GB)" required min={0} allowDecimal={false} {...form.getInputProps('volumenGb')} />
                    <NumberInput label="Duración (min)" required min={0} allowDecimal={false} {...form.getInputProps('duracionMin')} />
                    <NumberInput label="RPO comprometido (h)" required min={1} allowDecimal={false} {...form.getInputProps('rpoHoras')} />
                    <Select label="Resultado" required data={opciones(RESULTADO)} {...form.getInputProps('resultado')} />
                    <TextInput label="Responsable" required {...form.getInputProps('responsable')} />
                  </SimpleGrid>
                  {editando ? (
                    fechaCambiada(form.values.fecha) &&
                    fueraDelPlan(form.values) &&
                    admin && (
                      <Alert color="orange" title="La nueva fecha queda fuera del plan">
                        {fueraDelPlan(form.values)} Se registrará como excepción y el motivo del cambio será su justificación.
                      </Alert>
                    )
                  ) : (
                    <CampoExcepcion
                      fuera={fueraDelPlan(form.values)}
                      value={form.values.motivoExcepcion}
                      onChange={(m) => form.setFieldValue('motivoExcepcion', m)}
                      error={form.errors.motivoExcepcion as string | undefined}
                    />
                  )}
                  <Group gap="md">
                    <Checkbox label="Cifrado (A.8.24)" {...form.getInputProps('cifrado', { type: 'checkbox' })} />
                    <Checkbox label="Copia fuera de sitio" {...form.getInputProps('fueraSitio', { type: 'checkbox' })} />
                    <Checkbox label="Retención inmutable" {...form.getInputProps('inmutable', { type: 'checkbox' })} />
                    <Checkbox label="Integridad verificada" {...form.getInputProps('integridad', { type: 'checkbox' })} />
                  </Group>
                  <TextInput
                    label="Evidencia"
                    placeholder="Registro del software de respaldo, ticket o acta"
                    description="Referencia documental: la aplicación registra el respaldo; no lo ejecuta ni almacena copias."
                    {...form.getInputProps('evidencia')}
                  />
                  <Textarea label="Observaciones" autosize minRows={1} placeholder="Incidencias, causa de un fallo…" {...form.getInputProps('observaciones')} />
                  {!editando && form.values.resultado !== 'FALLIDO' && (
                    <div>
                      <Text size="sm" fw={500}>
                        Prueba de restauración prevista (paso 3, opcional)
                      </Text>
                      <Text size="xs" c="dimmed" mb={4}>
                        Tiene su propio plazo. También se puede programar después desde la tabla.
                      </Text>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <DateTimePicker label="Inicio previsto" valueFormat="DD MMM YYYY HH:mm" clearable {...form.getInputProps('pruebaPrevista')} />
                        <DateTimePicker label="Límite" valueFormat="DD MMM YYYY HH:mm" clearable {...form.getInputProps('pruebaLimite')} />
                      </SimpleGrid>
                    </div>
                  )}
                  {editando && (
                    <Textarea
                      label="Motivo del cambio"
                      required
                      autosize
                      minRows={2}
                      maxLength={300}
                      placeholder="Indique por qué se modifica el registro y la evidencia que lo respalda (mínimo 20 caracteres)."
                      {...form.getInputProps('motivoCambio')}
                    />
                  )}
                  <Group gap="sm">
                    <Button type="submit" loading={registrar.isPending || modificar.isPending}>
                      {editando ? 'Guardar cambios' : 'Registrar respaldo'}
                    </Button>
                    {editando && <Button variant="default" onClick={limpiar}>Cancelar</Button>}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {editando ? 'Se conserva la versión anterior del registro.' : 'Esquema 3-2-1: 3 copias, 2 medios, 1 fuera de sitio.'}
                  </Text>
                </Stack>
              </form>
            )}
          </Panel>
        </Grid.Col>
      </Grid>
      <Agenda
        titulo="Calendario de ejecución: previsto y real"
        descripcion="Ventanas previstas (trazo discontinuo) frente a las ejecuciones registradas con su hora real; ⚠ las registradas como excepción."
        modulos={['respaldos']}
        capa={2}
      />
      {acciones.modales}
    </Stack>
  )
}

/**
 * Capa 3 · Ventana prevista de la prueba de restauración de esta copia, con su
 * propio plazo. Una ya programada solo la cambia o amplía un admin.
 */
function PruebaPrevista({ ejecucion: e }: { ejecucion: Ejecucion }) {
  const operar = usePuedeOperar()
  const admin = usePuedeAdministrar()
  const programar = useProgramarPrueba()
  const ampliar = useAmpliarPlazoPrueba()
  const [modal, setModal] = useState<'programar' | 'ampliar' | null>(null)
  if (e.anuladoEn || e.resultado === 'FALLIDO') return null
  const cerrar = () => setModal(null)
  const opciones = (titulo: string) => ({
    onSuccess: () => {
      notifications.show({ color: 'green', title: titulo, message: 'El cambio queda en las trazas.' })
      cerrar()
    },
    onError: (err: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: err.message }),
  })
  return (
    <>
      <Text size="xs" c="dimmed">
        Prueba: {e.pruebaPrevista ? `${fmt(e.pruebaPrevista)} → ${fmt(e.pruebaLimite)}` : 'sin programar'}
      </Text>
      <Group gap={4}>
        {operar && (!e.pruebaPrevista || admin) && (
          <Button size="compact-xs" variant="subtle" onClick={() => setModal('programar')}>
            {e.pruebaPrevista ? 'Reprogramar prueba' : 'Programar prueba'}
          </Button>
        )}
        {admin && e.pruebaLimite && (
          <Button size="compact-xs" variant="subtle" color="orange" onClick={() => setModal('ampliar')}>
            Ampliar plazo
          </Button>
        )}
      </Group>
      <VentanaModal
        abierto={modal === 'programar'}
        onCerrar={cerrar}
        titulo={`Programar la prueba de restauración de ${folio('RES', e.id)}`}
        explicacion="La prueba comprueba que esta copia se puede restaurar. Tiene su propio plazo; no puede empezar antes de la ejecución."
        prevista={e.pruebaPrevista}
        limite={e.pruebaLimite}
        minimo={e.fecha}
        enviando={programar.isPending}
        onConfirmar={(prevista, limite) => programar.mutate({ id: e.id, prevista, limite }, opciones('Prueba programada'))}
      />
      <AmpliarPlazoModal
        abierto={modal === 'ampliar'}
        onCerrar={cerrar}
        titulo={`Ampliar el plazo de la prueba de ${folio('RES', e.id)}`}
        limiteActual={e.pruebaLimite}
        enviando={ampliar.isPending}
        onConfirmar={(nuevoLimite, motivo) => ampliar.mutate({ id: e.id, nuevoLimite, motivo }, opciones('Plazo ampliado'))}
      />
    </>
  )
}
