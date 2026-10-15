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
import { useState } from 'react'
import { formatearFecha } from '../../../shared/formato.ts'
import { AccionesRegistro, BadgeRegistro } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { usePuedeOperar } from '../../auth/use-puede.ts'
import {
  useEjecucionesRestaurables,
  useModificarRestauracion,
  useRegistrarRestauracion,
  type Plan,
  type Restauracion,
  type Tablero,
  type VentanaCalendario,
} from '../api/respaldos.ts'
import { COLOR_RESULTADO, MOTIVO_RESTAURACION, opciones, RESULTADO, TIPO } from '../catalogos.ts'
import { useAccionesRegistro } from './acciones.tsx'
import { Calendario, Panel } from './comunes.tsx'
import { fechaDeVentana, folio } from '../folios.ts'

const hoy = () => new Date().toISOString().slice(0, 10)

interface Valores {
  ejecucionId: string
  fecha: string
  motivo: string
  resultado: string
  tiempoRealMin: number | string
  rtoMinutos: number | string
  evidencia: string
  responsable: string
  integridad: boolean
  observaciones: string
  motivoCambio: string
}

const VACIO: Valores = {
  ejecucionId: '',
  fecha: '',
  motivo: '',
  resultado: '',
  tiempoRealMin: 120,
  rtoMinutos: 240,
  evidencia: '',
  responsable: '',
  integridad: true,
  observaciones: '',
  motivoCambio: '',
}

const requerido = (v: unknown) => (v === '' || v === null || v === undefined ? 'Obligatorio.' : null)
const entero = (min: number) => (v: number | string) =>
  typeof v !== 'number' || !Number.isInteger(v) || v < min ? `Entero mayor o igual que ${min}.` : null

/** Paso 3 · Restauración o prueba: verifica un respaldo ejecutado y mide el RTO. */
export function PasoRestauracion({
  planes,
  restauraciones,
  tablero,
  etiquetaPeriodo,
}: {
  planes: Plan[]
  restauraciones: Restauracion[]
  tablero?: Tablero
  etiquetaPeriodo: string
}) {
  const puedeOperar = usePuedeOperar()
  const fuentes = useEjecucionesRestaurables()
  const registrar = useRegistrarRestauracion()
  const modificar = useModificarRestauracion()
  const acciones = useAccionesRegistro('restauraciones')
  const [editando, setEditando] = useState<Restauracion | null>(null)
  const [ventana, setVentana] = useState<{ plan: Plan; ventana: VentanaCalendario } | null>(null)

  // Al venir de una ventana de prueba, solo los respaldos de ese activo anteriores a su cierre.
  const disponibles = (fuentes.data ?? []).filter(
    (e) => !ventana || (e.activoId === ventana.plan.activoId && e.fecha.slice(0, 10) <= ventana.ventana.fin),
  )

  const form = useForm<Valores>({
    initialValues: { ...VACIO, fecha: hoy() },
    validate: {
      ejecucionId: (v) => (editando ? null : requerido(v)),
      fecha: (v) => (!v ? 'Obligatorio.' : v > hoy() ? 'No puede ser futura.' : null),
      motivo: requerido,
      resultado: requerido,
      tiempoRealMin: entero(0),
      rtoMinutos: entero(1),
      evidencia: (v) => (v.trim().length < 3 ? 'Mínimo 3 caracteres.' : v.length > 60 ? 'Máximo 60 caracteres.' : null),
      responsable: (v) => (v.trim() ? null : 'Obligatorio.'),
      observaciones: (v) => (v.length > 2000 ? 'Máximo 2000 caracteres.' : null),
      motivoCambio: (v) => (editando ? errorMotivo(v) : null),
    },
  })

  const seleccionarVentana = (planId: number, w: VentanaCalendario) => {
    const plan = planes.find((p) => p.id === planId)
    if (!plan) return
    setEditando(null)
    setVentana({ plan, ventana: w })
    form.setValues({
      ...VACIO,
      fecha: fechaDeVentana(w, hoy()),
      motivo: 'PRUEBA_PROGRAMADA',
      rtoMinutos: plan.rtoMinutos,
      responsable: plan.responsable,
    })
  }

  /** El respaldo de origen determina el RTO comprometido en su plan. */
  const elegirOrigen = (id: string | null) => {
    form.setFieldValue('ejecucionId', id ?? '')
    const origen = disponibles.find((e) => String(e.id) === id)
    const plan = origen && planes.find((p) => p.id === origen.planId)
    if (plan) form.setFieldValue('rtoMinutos', plan.rtoMinutos)
  }

  const empezarEdicion = (r: Restauracion) => {
    setVentana(null)
    setEditando(r)
    form.setValues({
      ...VACIO,
      ejecucionId: String(r.ejecucionId),
      fecha: r.fecha.slice(0, 10),
      motivo: r.motivo,
      resultado: r.resultado,
      tiempoRealMin: r.tiempoRealMin,
      rtoMinutos: r.rtoMinutos,
      evidencia: r.evidencia,
      responsable: r.responsable,
      integridad: r.integridad,
      observaciones: r.observaciones ?? '',
    })
  }
  const limpiar = () => {
    setEditando(null)
    setVentana(null)
    form.setValues({ ...VACIO, fecha: hoy() })
  }

  const enviar = form.onSubmit((v) => {
    const datos = {
      fecha: `${v.fecha}T00:00:00.000Z`,
      motivo: v.motivo as Restauracion['motivo'],
      resultado: v.resultado as Restauracion['resultado'],
      tiempoRealMin: Number(v.tiempoRealMin),
      rtoMinutos: Number(v.rtoMinutos),
      evidencia: v.evidencia.trim(),
      responsable: v.responsable.trim(),
      integridad: v.integridad,
      observaciones: v.observaciones.trim() || undefined,
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    if (editando) {
      modificar.mutate(
        { id: editando.id, datos: { ...datos, motivoCambio: v.motivoCambio.trim() } },
        {
          onSuccess: (r) => {
            notifications.show({ color: 'green', title: 'Restauración modificada', message: `${folio('RST', r.id)} · versión ${r.version}` })
            limpiar()
          },
          onError: error,
        },
      )
      return
    }
    registrar.mutate(
      { ...datos, ejecucionId: Number(v.ejecucionId) },
      {
        onSuccess: (r) => {
          notifications.show({ color: 'green', title: 'Restauración registrada', message: `${folio('RST', r.id)} · ${r.activo.nombre}` })
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
        tipo="prueba"
        titulo="Calendario de verificables de restauración"
        control="A.5.30"
        explicacion="Cada plan exige probar la restauración con la frecuencia comprometida. Pulse una ventana para registrar su verificable con el activo y el RTO ya cargados. Las restauraciones por incidente se registran aparte y no sustituyen la prueba programada."
        onSeleccionar={seleccionarVentana}
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, xl: 8 }}>
          <Panel titulo="Paso 3 · Restauraciones y pruebas" control="A.5.30" pista={`${restauraciones.length} registro(s) en ${etiquetaPeriodo}`}>
            <Table.ScrollContainer minWidth={1050}>
              <Table striped verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Folio</Table.Th>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Activo</Table.Th>
                    <Table.Th>Origen</Table.Th>
                    <Table.Th>Motivo</Table.Th>
                    <Table.Th>Tiempo real</Table.Th>
                    <Table.Th>RTO objetivo</Table.Th>
                    <Table.Th>Integridad</Table.Th>
                    <Table.Th>Evidencia</Table.Th>
                    <Table.Th>Resultado</Table.Th>
                    <Table.Th>Reg.</Table.Th>
                    <Table.Th>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {restauraciones.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={12}>
                        <Text c="dimmed" ta="center" py="md">Sin restauraciones registradas en el período.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {restauraciones.map((r) => (
                    <Table.Tr key={r.id} style={{ opacity: r.anuladoEn ? 0.55 : 1 }}>
                      <Table.Td ff="monospace" td={r.anuladoEn ? 'line-through' : undefined}>{folio('RST', r.id)}</Table.Td>
                      <Table.Td>{formatearFecha(r.fecha)}</Table.Td>
                      <Table.Td>{r.activo.nombre}</Table.Td>
                      <Table.Td ff="monospace">{folio('RES', r.ejecucionId)}</Table.Td>
                      <Table.Td>{MOTIVO_RESTAURACION[r.motivo]}</Table.Td>
                      <Table.Td>{r.tiempoRealMin} min</Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {r.rtoMinutos} min
                          <Badge size="xs" color={r.tiempoRealMin <= r.rtoMinutos ? 'green' : 'red'}>
                            {r.tiempoRealMin <= r.rtoMinutos ? 'en RTO' : 'excede'}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={r.integridad ? 'green' : 'red'} variant="light">
                          {r.integridad ? 'Íntegro' : 'No verificado'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {r.evidencia}
                        {r.observaciones && <Text size="xs" c="dimmed" lineClamp={2}>{r.observaciones}</Text>}
                      </Table.Td>
                      <Table.Td><Badge size="sm" color={COLOR_RESULTADO[r.resultado]} variant="light">{RESULTADO[r.resultado]}</Badge></Table.Td>
                      <Table.Td><BadgeRegistro registro={r} /></Table.Td>
                      <Table.Td>
                        <AccionesRegistro
                          registro={r}
                          onModificar={() => empezarEdicion(r)}
                          onAnular={() => acciones.anular(r.id, folio('RST', r.id))}
                          onReversar={() => acciones.reversar(r.id, folio('RST', r.id))}
                          onTrazas={() => acciones.verTrazas(r.id, folio('RST', r.id))}
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
            titulo={editando ? 'Modificar restauración' : 'Registrar restauración o prueba'}
            control="A.5.30"
            extra={editando && <Badge color="yellow" variant="light">Modificando {folio('RST', editando.id)} · v{editando.version}</Badge>}
          >
            {!puedeOperar ? (
              <Alert color="gray">Su perfil es de solo lectura.</Alert>
            ) : !editando && (fuentes.data ?? []).length === 0 ? (
              <Alert color="blue" title="Aún no hay respaldos ejecutados que restaurar">
                Registre primero una ejecución en el paso 2: toda restauración debe referirse a un respaldo existente y verificable.
              </Alert>
            ) : (
              <form onSubmit={enviar} noValidate>
                <Stack gap="sm">
                  {ventana && (
                    <Alert color="blue" withCloseButton onClose={limpiar} title={`Verificable de ${ventana.ventana.etiqueta}`}>
                      {ventana.plan.activo.nombre} · del {ventana.ventana.ini} al {ventana.ventana.fin}.
                      {disponibles.length === 0 && ' No hay respaldos de ese activo anteriores al cierre de la ventana: registre primero la ejecución en el paso 2.'}
                    </Alert>
                  )}
                  {editando ? (
                    <TextInput label="Respaldo de origen" value={`${folio('RES', editando.ejecucionId)} · ${editando.activo.nombre}`} disabled />
                  ) : (
                    <Select
                      label="Respaldo de origen"
                      required
                      searchable
                      description="Determina el activo restaurado y el RTO comprometido en su plan."
                      data={disponibles.map((e) => ({
                        value: String(e.id),
                        label: `${folio('RES', e.id)} · ${e.activo.nombre} · ${formatearFecha(e.fecha)} · ${TIPO[e.tipo]}`,
                      }))}
                      {...form.getInputProps('ejecucionId')}
                      onChange={elegirOrigen}
                    />
                  )}
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput type="date" label="Fecha" required max={hoy()} {...form.getInputProps('fecha')} />
                    <Select label="Motivo" required data={opciones(MOTIVO_RESTAURACION)} {...form.getInputProps('motivo')} />
                    <Select label="Resultado" required data={opciones(RESULTADO)} {...form.getInputProps('resultado')} />
                    <NumberInput label="Tiempo real (min)" required min={0} allowDecimal={false} {...form.getInputProps('tiempoRealMin')} />
                    <NumberInput label="RTO objetivo (min)" required min={1} allowDecimal={false} {...form.getInputProps('rtoMinutos')} />
                    <TextInput label="Evidencia (acta o ticket)" required maxLength={60} placeholder="Acta PR-10/2026" {...form.getInputProps('evidencia')} />
                    <TextInput label="Responsable" required {...form.getInputProps('responsable')} />
                  </SimpleGrid>
                  <Checkbox label="Integridad de los datos verificada (A.8.13)" {...form.getInputProps('integridad', { type: 'checkbox' })} />
                  <Textarea label="Observaciones" autosize minRows={1} placeholder="Diferencias entre la prueba prevista y lo ejecutado, incidencias…" {...form.getInputProps('observaciones')} />
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
                      {editando ? 'Guardar cambios' : 'Registrar restauración'}
                    </Button>
                    {editando && <Button variant="default" onClick={limpiar}>Cancelar</Button>}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {editando ? 'El cambio queda versionado y trazado.' : 'Toda prueba requiere acta de respaldo documental.'}
                  </Text>
                </Stack>
              </form>
            )}
          </Panel>
        </Grid.Col>
      </Grid>
      {acciones.modales}
    </Stack>
  )
}
