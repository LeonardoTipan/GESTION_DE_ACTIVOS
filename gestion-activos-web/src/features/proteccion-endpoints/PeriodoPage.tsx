import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Center, Group, Loader, NumberInput, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconHistory, IconRotateClockwise } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import { BloqueEjecucionCierre } from '../../shared/cierre/BloqueEjecucionCierre.tsx'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { Dato, ModalReabrir } from '../../shared/cierre/componentes.tsx'
import { errorRepositorio } from '../../shared/evidencia.ts'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { BadgeRegistro, TrazasModal } from '../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import { useActivos } from '../inventario/api/activos.ts'
import { useCerrarPeriodo, usePeriodo, useReabrirPeriodo, useRegistrarPeriodo, type PeriodoEndpoint } from './api.ts'
import { ConfirmarCierreModal, DatosEjecucion, DatosPlanificacion, type ResumenCierre } from './componentes.tsx'
import { ETIQUETAS_TRAZA, INFO_ESTADO, nombrePeriodo } from './textos.ts'

/** Cobertura calculada en el momento (la misma fórmula que el backend: 1 decimal). */
const coberturaDe = (total: number | '', con: number | '') =>
  typeof total === 'number' && typeof con === 'number' && total > 0 ? Math.round((con / total) * 1000) / 10 : null

/** Primer instante del mes del período, en hora local («AAAA-MM-01 00:00:00»). */
const inicioMes = (p: PeriodoEndpoint) => `${p.anio}-${String(p.mes).padStart(2, '0')}-01 00:00:00`

interface Valores {
  totalActivos: number | ''
  equiposConAntivirus: number | ''
  fechaEjecucion: string | null
  responsableEjecucion: string
  evidencia: string
  repositorioVerificable: string
  observacion: string
}

/** Fase 2 · registro y cierre: guardar avance (En progreso) o cerrar (el backend valida todo). */
function FormRegistro({ p }: { p: PeriodoEndpoint }) {
  const registrar = useRegistrarPeriodo()
  const cerrar = useCerrarPeriodo()
  // Referencia, NO un límite: los equipos sujetos a control que ve la aplicación hoy.
  const sujetos = useActivos({ operativos: true, aplica: 'ENDPOINT', page: 1, limit: 1 })
  const [porCerrar, setPorCerrar] = useState<ResumenCierre | null>(null)
  const form = useForm<Valores>({
    initialValues: {
      totalActivos: p.totalActivos ?? '',
      equiposConAntivirus: p.equiposConAntivirus ?? '',
      fechaEjecucion: p.fechaEjecucion ? isoAFechaHoraLocal(p.fechaEjecucion) : null,
      responsableEjecucion: p.responsableEjecucion ?? '',
      evidencia: p.evidencia ?? '',
      repositorioVerificable: p.repositorioVerificable ?? '',
      observacion: p.observacion ?? '',
    },
    validate: {
      totalActivos: (v) => (v !== '' && v < 1 ? 'Al menos 1' : null),
      equiposConAntivirus: (v, x) => (v !== '' && v < 0 ? 'No puede ser negativo' : v !== '' && x.totalActivos !== '' && v > x.totalActivos ? 'No puede superar el total de activos' : null),
      fechaEjecucion: (v) => (v && v > ahoraLocal() ? 'No puede ser futura' : v && v < inicioMes(p) ? 'No puede ser anterior al mes del período' : null),
      responsableEjecucion: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
    },
  })
  const v = form.values
  const cobertura = coberturaDe(v.totalActivos, v.equiposConAntivirus)
  const datos = (x: Valores) => ({
    totalActivos: x.totalActivos === '' ? undefined : x.totalActivos,
    equiposConAntivirus: x.equiposConAntivirus === '' ? undefined : x.equiposConAntivirus,
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
      ...(x.totalActivos === '' ? { totalActivos: 'Obligatorio para cerrar' } : {}),
      ...(x.equiposConAntivirus === '' ? { equiposConAntivirus: 'Obligatorio para cerrar' } : {}),
      ...(x.fechaEjecucion ? {} : { fechaEjecucion: 'Obligatoria para cerrar' }),
      ...(x.responsableEjecucion.trim() ? {} : { responsableEjecucion: 'Obligatorio para cerrar' }),
      ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para cerrar' }),
      ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para cerrar' }),
    }
    if (Object.keys(faltan).length) {
      form.setErrors(faltan)
      notifications.show({ color: 'orange', title: 'No se puede cerrar todavía', message: 'Complete los campos marcados.' })
      return
    }
    // Se confirma lo que quedará registrado; nada se envía hasta entonces.
    setPorCerrar({
      anio: p.anio,
      mes: p.mes,
      totalActivos: Number(x.totalActivos),
      equiposConAntivirus: Number(x.equiposConAntivirus),
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
        guardar={{ etiqueta: 'Guardar avance', cargando: registrar.isPending, deshabilitado: !form.isDirty() }}
        cerrar={{ etiqueta: 'Cerrar período', cargando: cerrar.isPending, onClick: cerrarPeriodo }}
      >
        <Alert variant="light" color="blue">
          {sujetos.data
            ? `El sistema detecta ${sujetos.data.meta.total} equipo(s) sujetos a control (categorías con Protección de endpoints). Es una referencia: registre el total REAL del inventario del mes.`
            : 'Cargando los equipos sujetos a control…'}
        </Alert>
        <Text size="xs" c="dimmed">
          Los campos con * son obligatorios para cerrar. Puede guardar avances sin ellos.
        </Text>
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
            <Badge variant="light" color={INFO_ESTADO[p.estado].color}>{INFO_ESTADO[p.estado].etiqueta}</Badge>
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
        {cerrado || !puedeOperar || p.anuladoEn ? (
          <DatosEjecucion p={p} />
        ) : (
          <FormRegistro key={p.version} p={p} />
        )}
      </Card>

      <TrazasModal abierto={historial} entidad="PERIODO_ENDPOINT" registroId={p.id} titulo={`Historial · ${nombrePeriodo(p.anio, p.mes)}`} etiquetas={ETIQUETAS_TRAZA} onCerrar={verHistorial.close} />
      {esAdmin && <ReabrirModal p={p} opened={reabriendo} onClose={reapertura.close} />}
    </Stack>
  )
}
