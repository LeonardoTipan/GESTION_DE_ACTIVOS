import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Group,
  Loader,
  NumberInput,
  Radio,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconHistory, IconListCheck, IconRotateClockwise, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BloqueEjecucionCierre } from '../../shared/cierre/BloqueEjecucionCierre.tsx'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { Dato, ModalReabrir } from '../../shared/cierre/componentes.tsx'
import { errorRepositorio } from '../../shared/evidencia.ts'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { BadgeRegistro, TrazasModal } from '../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import {
  useCargarEquipos,
  useCerrarPeriodo,
  useEquiposPeriodo,
  usePeriodo,
  useReabrirPeriodo,
  useRegistrarPeriodo,
  type EquipoPeriodo,
  type PeriodoEndpoint,
} from './api.ts'
import { AvisoInventario, BadgeEstadoPeriodo, ConfirmarCierreModal, DatosEjecucion, DatosPlanificacion, type ResumenCierre } from './componentes.tsx'
import { cambiosDeEquipos, conteoEquipos, ETIQUETAS_TRAZA, nombrePeriodo, type MarcasEquipos } from './textos.ts'

/** Cobertura calculada en el momento (la misma fórmula que el backend: 1 decimal). */
const coberturaDe = (total: number | '', con: number | '') =>
  typeof total === 'number' && typeof con === 'number' && total > 0 ? Math.round((con / total) * 1000) / 10 : null

/** Primer instante del mes del período, en hora local («AAAA-MM-01 00:00:00»). */
const inicioMes = (p: PeriodoEndpoint) => `${p.anio}-${String(p.mes).padStart(2, '0')}-01 00:00:00`

interface Valores {
  /** Solo en períodos SIN detalle por equipo (anteriores a él). */
  totalActivos: number | ''
  equiposConAntivirus: number | ''
  /** Con detalle: el antivirus de cada equipo (por activoId). */
  equipos: MarcasEquipos
  fechaEjecucion: string | null
  responsableEjecucion: string
  evidencia: string
  repositorioVerificable: string
  observacion: string
}

/** Lista de equipos del período: cada uno con o sin antivirus. Los totales se calculan de aquí. */
function ListaEquipos({ equipos, marcas, onMarcar }: { equipos: EquipoPeriodo[]; marcas: MarcasEquipos; onMarcar: (activoId: number, conAntivirus: boolean) => void }) {
  const [texto, setTexto] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const q = texto.trim().toLowerCase()
  const visibles = equipos.filter(
    (e) =>
      (!soloPendientes || marcas[e.activoId] === null) &&
      (!q || `${e.activo.codigo} ${e.activo.nombre} ${e.activo.categoria} ${e.activo.tipo ?? ''}`.toLowerCase().includes(q)),
  )
  const pendientes = equipos.filter((e) => marcas[e.activoId] === null)
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <TextInput label="Buscar equipo" placeholder="Código, nombre, categoría o tipo" leftSection={<IconSearch size={14} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} w={{ base: '100%', sm: 260 }} />
          <Switch label="Solo sin registrar" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.currentTarget.checked)} mb={8} />
        </Group>
        <Button variant="light" size="xs" leftSection={<IconListCheck size={14} />} disabled={!pendientes.length} onClick={() => pendientes.forEach((e) => onMarcar(e.activoId, true))}>
          Marcar los {pendientes.length} sin registrar con antivirus
        </Button>
      </Group>
      <ScrollArea.Autosize mah={420} type="auto">
        <Table striped verticalSpacing={4} fz="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Código</Table.Th>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Categoría</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Antivirus</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibles.map((e) => {
              const valor = marcas[e.activoId]
              return (
                <Table.Tr key={e.activoId}>
                  <Table.Td>
                    <Anchor component={Link} to={`/activos/${e.activoId}`} size="sm">
                      {e.activo.codigo}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{e.activo.nombre}</Table.Td>
                  <Table.Td>{e.activo.categoria}</Table.Td>
                  <Table.Td>{e.activo.tipo ?? '—'}</Table.Td>
                  <Table.Td>
                    <Radio.Group
                      aria-label={`Antivirus de ${e.activo.codigo}`}
                      value={valor === null ? '' : valor ? 'si' : 'no'}
                      onChange={(v) => onMarcar(e.activoId, v === 'si')}
                    >
                      <Group gap="md" wrap="nowrap">
                        <Radio value="si" label="Con antivirus" size="xs" />
                        <Radio value="no" label="Sin antivirus" size="xs" color="red" />
                      </Group>
                    </Radio.Group>
                  </Table.Td>
                </Table.Tr>
              )
            })}
            {!visibles.length && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">
                    Ningún equipo coincide.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  )
}

/** Fase 2 · registro y cierre: guardar avance (En progreso) o cerrar (el backend valida todo). */
function FormRegistro({ p, equipos }: { p: PeriodoEndpoint; equipos: EquipoPeriodo[] }) {
  const registrar = useRegistrarPeriodo()
  const cerrar = useCerrarPeriodo()
  const [porCerrar, setPorCerrar] = useState<ResumenCierre | null>(null)
  const conDetalle = p.conDetalle
  const iniciales: MarcasEquipos = Object.fromEntries(equipos.map((e) => [e.activoId, e.conAntivirus]))
  const form = useForm<Valores>({
    initialValues: {
      totalActivos: p.totalActivos ?? '',
      equiposConAntivirus: p.equiposConAntivirus ?? '',
      equipos: iniciales,
      fechaEjecucion: p.fechaEjecucion ? isoAFechaHoraLocal(p.fechaEjecucion) : null,
      responsableEjecucion: p.responsableEjecucion ?? '',
      evidencia: p.evidencia ?? '',
      repositorioVerificable: p.repositorioVerificable ?? '',
      observacion: p.observacion ?? '',
    },
    validate: {
      totalActivos: (v) => (!conDetalle && v !== '' && v < 1 ? 'Al menos 1' : null),
      equiposConAntivirus: (v, x) =>
        conDetalle ? null : v !== '' && v < 0 ? 'No puede ser negativo' : v !== '' && x.totalActivos !== '' && v > x.totalActivos ? 'No puede superar el total de activos' : null,
      fechaEjecucion: (v) => (v && v > ahoraLocal() ? 'No puede ser futura' : v && v < inicioMes(p) ? 'No puede ser anterior al mes del período' : null),
      responsableEjecucion: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
    },
  })
  const v = form.values
  const conteo = conteoEquipos(v.equipos)
  const total = conDetalle ? conteo.total : v.totalActivos
  const con = conDetalle ? conteo.con : v.equiposConAntivirus
  const cobertura = coberturaDe(total, con)
  const datos = (x: Valores) => ({
    ...(conDetalle
      ? { equipos: cambiosDeEquipos(iniciales, x.equipos) }
      : {
          totalActivos: x.totalActivos === '' ? undefined : x.totalActivos,
          equiposConAntivirus: x.equiposConAntivirus === '' ? undefined : x.equiposConAntivirus,
        }),
    fechaEjecucion: x.fechaEjecucion ? fechaHoraLocalAIso(x.fechaEjecucion) : undefined,
    responsableEjecucion: x.responsableEjecucion.trim() || undefined,
    evidencia: x.evidencia.trim() || undefined,
    repositorioVerificable: x.repositorioVerificable.trim() || undefined,
    observacion: x.observacion.trim() || undefined,
  })
  const enviar = form.onSubmit((x) =>
    registrar.mutate(
      { id: p.id, datos: datos(x) },
      {
        onSuccess: () => {
          aviso('Avance guardado', 'El período queda En progreso hasta cerrarlo.')
          form.resetDirty()
        },
        onError: fallo('No se pudo guardar'),
      },
    ),
  )
  const cerrarPeriodo = () => {
    if (form.validate().hasErrors) return
    const x = form.getValues()
    const faltan: Partial<Record<keyof Valores, string>> = {
      ...(!conDetalle && x.totalActivos === '' ? { totalActivos: 'Obligatorio para cerrar' } : {}),
      ...(!conDetalle && x.equiposConAntivirus === '' ? { equiposConAntivirus: 'Obligatorio para cerrar' } : {}),
      ...(conDetalle && conteoEquipos(x.equipos).sinRegistrar > 0 ? { equipos: `Faltan ${conteoEquipos(x.equipos).sinRegistrar} equipo(s) por registrar` } : {}),
      ...(x.fechaEjecucion ? {} : { fechaEjecucion: 'Obligatoria para cerrar' }),
      ...(x.responsableEjecucion.trim() ? {} : { responsableEjecucion: 'Obligatorio para cerrar' }),
      ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para cerrar' }),
      ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para cerrar' }),
    }
    if (Object.keys(faltan).length) {
      form.setErrors(faltan)
      notifications.show({ color: 'orange', title: 'No se puede cerrar todavía', message: faltan.equipos ?? 'Complete los campos marcados.' })
      return
    }
    // Se confirma lo que quedará registrado; nada se envía hasta entonces.
    setPorCerrar({
      anio: p.anio,
      mes: p.mes,
      totalActivos: Number(total),
      equiposConAntivirus: Number(con),
      fechaEjecucion: fechaHoraLocalAIso(x.fechaEjecucion!),
      responsableEjecucion: x.responsableEjecucion.trim(),
      evidencia: x.evidencia.trim(),
      repositorioVerificable: x.repositorioVerificable.trim(),
    })
  }
  const confirmarCierre = () =>
    cerrar.mutate(
      { id: p.id, datos: datos(form.getValues()) },
      {
        onSuccess: () => {
          aviso('Período cerrado', `Cobertura ${cobertura ?? '—'} %.`)
          setPorCerrar(null)
        },
        onError: fallo('No se pudo cerrar'),
      },
    )
  return (
    <form onSubmit={enviar} noValidate>
      <BloqueEjecucionCierre
        verificable={{ label: 'Evidencia verificable (inventario de equipos)', withAsterisk: true, description: 'Nombre del archivo Excel del inventario del mes (la aplicación no guarda archivos)', placeholder: 'Inventario de equipos octubre 2026.xlsx', ...form.getInputProps('evidencia') }}
        repositorio={{ withAsterisk: true, description: 'Carpeta compartida o URL http(s) donde está el Excel', placeholder: 'Carpeta Compartida TICs/Antivirus', ...form.getInputProps('repositorioVerificable') }}
        observacion={{ label: 'Observaciones', ...form.getInputProps('observacion') }}
        guardar={{ etiqueta: 'Guardar avance', cargando: registrar.isPending, deshabilitado: !form.isDirty() || cerrar.isPending }}
        cerrar={{ etiqueta: 'Cerrar período', cargando: cerrar.isPending, onClick: cerrarPeriodo }}
      >
        <Text size="xs" c="dimmed">
          Los campos con * son obligatorios para cerrar. Puede guardar avances sin ellos.
        </Text>
        {conDetalle ? (
          <>
            <SimpleGrid cols={{ base: 2, sm: 5 }}>
              <Dato etiqueta="Total de activos sujetos a control">{conteo.total}</Dato>
              <Dato etiqueta="Con antivirus">{conteo.con}</Dato>
              <Dato etiqueta="Sin antivirus">{conteo.sin}</Dato>
              <Dato etiqueta="Sin registrar">
                <Text span size="sm" c={conteo.sinRegistrar ? 'orange' : undefined} fw={conteo.sinRegistrar ? 600 : undefined}>
                  {conteo.sinRegistrar}
                </Text>
              </Dato>
              <Dato etiqueta="Porcentaje de cobertura">{cobertura === null ? '—' : `${cobertura} %`}</Dato>
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              Calculados de la lista de equipos (no se escriben a mano). La cobertura cuenta como sin antivirus los que aún no se registran.
            </Text>
            {form.errors.equipos && (
              <Alert color="orange" variant="light">
                {form.errors.equipos}
              </Alert>
            )}
            <ListaEquipos equipos={equipos} marcas={v.equipos} onMarcar={(id, valor) => form.setFieldValue(`equipos.${id}`, valor)} />
          </>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput label="Total de activos sujetos a control" withAsterisk description="Del inventario del mes" min={1} allowDecimal={false} allowNegative={false} {...form.getInputProps('totalActivos')} />
            <NumberInput label="Equipos que cuentan con antivirus" withAsterisk min={0} allowDecimal={false} allowNegative={false} {...form.getInputProps('equiposConAntivirus')} />
            <Dato etiqueta="Equipos que no cuentan con antivirus (calculado)">
              {typeof v.totalActivos === 'number' && typeof v.equiposConAntivirus === 'number' && v.equiposConAntivirus <= v.totalActivos ? v.totalActivos - v.equiposConAntivirus : '—'}
            </Dato>
            <Dato etiqueta="Porcentaje de cobertura (calculado)">
              {typeof v.equiposConAntivirus === 'number' && typeof v.totalActivos === 'number' && v.equiposConAntivirus <= v.totalActivos && cobertura !== null ? `${cobertura} %` : '—'}
            </Dato>
          </SimpleGrid>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Fecha real de ejecución"
            withAsterisk
            description="Cuándo se hizo REALMENTE (no futura; dentro o después del mes del período)"
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            clearable
            minDate={inicioMes(p)}
            maxDate={ahoraLocal()}
            {...form.getInputProps('fechaEjecucion')}
          />
          <TextInput label="Responsable de la ejecución" withAsterisk placeholder="Soporte TIC · J. Pérez" {...form.getInputProps('responsableEjecucion')} />
        </SimpleGrid>
      </BloqueEjecucionCierre>
      <ConfirmarCierreModal abierto={porCerrar !== null} resumen={porCerrar} enviando={cerrar.isPending} onConfirmar={confirmarCierre} onCerrar={() => setPorCerrar(null)} />
    </form>
  )
}

/** Períodos abiertos antes del detalle por equipo: se pueden cargar los equipos de hoy (una vez). */
function SinDetalle({ p }: { p: PeriodoEndpoint }) {
  const cargar = useCargarEquipos()
  return (
    <Alert color="yellow" variant="light" title="Período sin detalle por equipo">
      <Stack gap="xs">
        <Text size="sm">
          Este período se abrió antes del registro por equipo: sus totales se escriben a mano. Puede cargar los equipos sujetos a control de hoy para registrarlos uno por uno (una sola vez; queda en la auditoría).
        </Text>
        <Group>
          <Button size="xs" leftSection={<IconListCheck size={14} />} loading={cargar.isPending} onClick={() => cargar.mutate(p.id, { onSuccess: () => aviso('Equipos cargados', 'Registre ahora el antivirus de cada uno.'), onError: fallo('No se pudieron cargar') })}>
            Cargar los equipos sujetos a control
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

function Ejecucion({ p }: { p: PeriodoEndpoint }) {
  const equipos = useEquiposPeriodo(p.id, p.conDetalle)
  // El formulario parte de lo GUARDADO: tras guardar, se espera la lista recién leída (no la de la
  // caché), o las marcas aparecerían vacías y una acción en bloque podría pisar lo ya registrado.
  if (p.conDetalle && (equipos.isPending || equipos.isFetching)) return <Center py="md"><Loader size="sm" /></Center>
  if (equipos.error) return <Alert color="red" title="No se pudieron cargar los equipos">{equipos.error.message}</Alert>
  return (
    <Stack gap="md">
      {!p.conDetalle && <SinDetalle p={p} />}
      <FormRegistro key={`${p.version}-${p.conDetalle}-${equipos.dataUpdatedAt}`} p={p} equipos={equipos.data ?? []} />
    </Stack>
  )
}

function ReabrirModal({ p, opened, onClose }: { p: PeriodoEndpoint; opened: boolean; onClose: () => void }) {
  const reabrir = useReabrirPeriodo()
  return (
    <ModalReabrir
      abierto={opened}
      onCerrar={onClose}
      titulo="Reabrir el período"
      explicacion={<>Vuelve a <b>En progreso</b> con sus datos, para corregirlos. El cierre anterior queda en el historial.</>}
      validar={errorMotivo}
      enviando={reabrir.isPending}
      onConfirmar={(motivo) =>
        reabrir.mutate({ id: p.id, motivo }, { onSuccess: () => { aviso('Período reabierto', 'Vuelve a En progreso.'); onClose() }, onError: fallo('No se pudo reabrir') })
      }
    />
  )
}

/** Ficha de un período mensual: planificación, ejecución y cierre, e historial. */
export function PeriodoPage() {
  const id = Number(useParams().id)
  const consulta = usePeriodo(id)
  const puedeOperar = usePuedeOperar()
  const esAdmin = usePuedeAdministrar()
  const [historial, verHistorial] = useDisclosure()
  const [reabriendo, reapertura] = useDisclosure()
  if (consulta.isPending) return <Center py="xl"><Loader /></Center>
  if (consulta.error) return <Alert color="red" title="No se pudo cargar el período">{consulta.error.message}</Alert>
  const p = consulta.data
  const cerrado = p.estado === 'CERRADO'
  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Anchor component={Link} to={`/proteccion-endpoints?pestana=${cerrado ? 'bitacora' : 'ejecucion'}`}>Protección de Endpoints</Anchor>
        <Text>{nombrePeriodo(p.anio, p.mes)}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Período {nombrePeriodo(p.anio, p.mes)}</Title>
          <Group gap="xs" mt={4}>
            <BadgeEstadoPeriodo estado={p.estado} porEjecutar={p.porEjecutar} />
            <Badge variant="outline">{p.semestre}</Badge>
            <BadgeRegistro registro={p} />
          </Group>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconHistory size={16} />} onClick={verHistorial.open}>Historial</Button>
          {esAdmin && cerrado && !p.anuladoEn && (
            <Button variant="light" color="orange" leftSection={<IconRotateClockwise size={16} />} onClick={reapertura.open}>Reabrir</Button>
          )}
        </Group>
      </Group>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">1 · Planificación</Title>
        <DatosPlanificacion p={p} />
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">2 · Ejecución y cierre</Title>
        <Stack gap="md">
          <AvisoInventario p={p} />
          {cerrado || !puedeOperar || p.anuladoEn ? <DatosEjecucion p={p} /> : <Ejecucion p={p} />}
        </Stack>
      </Card>

      <TrazasModal abierto={historial} entidad="PERIODO_ENDPOINT" registroId={p.id} titulo={`Historial · ${nombrePeriodo(p.anio, p.mes)}`} etiquetas={ETIQUETAS_TRAZA} onCerrar={verHistorial.close} />
      {esAdmin && <ReabrirModal p={p} opened={reabriendo} onClose={reapertura.close} />}
    </Stack>
  )
}
