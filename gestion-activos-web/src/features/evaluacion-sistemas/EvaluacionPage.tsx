import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconHistory, IconRotateClockwise } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BloqueEjecucionCierre } from '../../shared/cierre/BloqueEjecucionCierre.tsx'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { ModalReabrir } from '../../shared/cierre/componentes.tsx'
import { errorRepositorio } from '../../shared/evidencia.ts'
import { ahoraLocal, fechaHoraLocalAIso, formatearFechaHora, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { BadgeRegistro, TrazasModal } from '../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import { useCerrarEvaluacion, useEvaluacion, useGuardarEjecucionEvaluacion, useReabrirEvaluacion, type EvaluacionSistema } from './api.ts'
import { BadgeEstadoEvaluacion, ConfirmarCierreEvaluacionModal, DatosEjecucionEvaluacion, DatosPlanificacionEvaluacion, type ResumenCierreEvaluacion } from './componentes.tsx'
import { ETIQUETAS_TRAZA, INFO_SITUACION, JUSTIFICACION_MINIMA } from './textos.ts'

interface Valores {
  fechaPruebas: string | null
  responsableEjecucion: string
  evidencia: string
  repositorioVerificable: string
  observacion: string
}

/** Fase 2 · ejecución y cierre: guardar avance (En progreso) o cerrar, con confirmación. */
function FormEjecucion({ e }: { e: EvaluacionSistema }) {
  const guardar = useGuardarEjecucionEvaluacion()
  const cerrar = useCerrarEvaluacion()
  const [porCerrar, setPorCerrar] = useState<ResumenCierreEvaluacion | null>(null)
  const programada = isoAFechaHoraLocal(e.fechaProgramadaProduccion)
  const form = useForm<Valores>({
    initialValues: {
      fechaPruebas: e.fechaPruebas ? isoAFechaHoraLocal(e.fechaPruebas) : null,
      responsableEjecucion: e.responsableEjecucion ?? '',
      evidencia: e.evidencia ?? '',
      repositorioVerificable: e.repositorioVerificable ?? '',
      observacion: e.observacion ?? '',
    },
    validate: {
      fechaPruebas: (v) => (v && v > ahoraLocal() ? 'No puede ser futura' : null),
      responsableEjecucion: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
    },
  })
  const tardia = Boolean(form.values.fechaPruebas && form.values.fechaPruebas > programada)
  const datos = (x: Valores) => ({
    fechaPruebas: x.fechaPruebas ? fechaHoraLocalAIso(x.fechaPruebas) : undefined,
    responsableEjecucion: x.responsableEjecucion.trim() || undefined,
    evidencia: x.evidencia.trim() || undefined,
    repositorioVerificable: x.repositorioVerificable.trim() || undefined,
    observacion: x.observacion.trim() || undefined,
  })
  const enviar = form.onSubmit((x) =>
    guardar.mutate(
      { id: e.id, datos: datos(x) },
      {
        onSuccess: () => {
          aviso('Avance guardado', 'La evaluación queda En progreso hasta cerrarla.')
          form.resetDirty()
        },
        onError: fallo('No se pudo guardar'),
      },
    ),
  )
  const cerrarEvaluacion = () => {
    if (form.validate().hasErrors) return
    const x = form.getValues()
    const faltan: Partial<Record<keyof Valores, string>> = {
      ...(x.fechaPruebas ? {} : { fechaPruebas: 'Obligatoria para cerrar' }),
      ...(x.responsableEjecucion.trim() ? {} : { responsableEjecucion: 'Obligatorio para cerrar' }),
      ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para cerrar' }),
      ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para cerrar' }),
      ...(tardia && x.observacion.trim().length < JUSTIFICACION_MINIMA
        ? { observacion: `Las pruebas fueron posteriores a la fecha planificada: justifique el retraso (mínimo ${JUSTIFICACION_MINIMA} caracteres)` }
        : {}),
    }
    if (Object.keys(faltan).length) {
      form.setErrors(faltan)
      notifications.show({ color: 'orange', title: 'No se puede cerrar todavía', message: 'Complete los campos marcados.' })
      return
    }
    // Se confirma lo que quedará registrado; nada se envía hasta entonces.
    setPorCerrar({
      codigo: e.activo.codigo,
      fechaPruebas: fechaHoraLocalAIso(x.fechaPruebas!),
      responsableEjecucion: x.responsableEjecucion.trim(),
      evidencia: x.evidencia.trim(),
      repositorioVerificable: x.repositorioVerificable.trim(),
      tardia,
    })
  }
  const confirmarCierre = () =>
    cerrar.mutate(
      { id: e.id, datos: datos(form.getValues()) },
      {
        onSuccess: () => {
          aviso('Evaluación cerrada', 'Queda en la bitácora por semestres.')
          setPorCerrar(null)
        },
        onError: fallo('No se pudo cerrar'),
      },
    )
  return (
    <form onSubmit={enviar} noValidate>
      <BloqueEjecucionCierre
        verificable={{ label: 'Verificable (informe de seguridad)', withAsterisk: true, description: 'Nombre del informe; el veredicto vive en el informe y en las observaciones', placeholder: 'Informe de pruebas de seguridad nómina v2.1.pdf', ...form.getInputProps('evidencia') }}
        repositorio={{ withAsterisk: true, description: 'Carpeta compartida o URL http(s) (no se guardan archivos)', placeholder: 'Carpeta Compartida TICs/Seguridad', ...form.getInputProps('repositorioVerificable') }}
        observacion={{
          label: 'Observaciones',
          description: tardia ? `Obligatoria (mínimo ${JUSTIFICACION_MINIMA} caracteres): las pruebas son posteriores a la fecha planificada.` : 'Resultado de las pruebas y hallazgos relevantes.',
          withAsterisk: tardia,
          ...form.getInputProps('observacion'),
        }}
        guardar={{ etiqueta: 'Guardar avance', cargando: guardar.isPending, deshabilitado: !form.isDirty() || cerrar.isPending }}
        cerrar={{ etiqueta: 'Cerrar evaluación', cargando: cerrar.isPending, onClick: cerrarEvaluacion }}
      >
        <Text size="xs" c="dimmed">
          Los campos con * son obligatorios para cerrar. Puede guardar avances sin ellos.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Fecha real de las pruebas de seguridad"
            withAsterisk
            description={`Cuándo se hicieron REALMENTE (no futura). Planificada: ${formatearFechaHora(e.fechaProgramadaProduccion)}.`}
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            clearable
            maxDate={ahoraLocal()}
            {...form.getInputProps('fechaPruebas')}
          />
          <TextInput label="Responsable de la ejecución" withAsterisk description="Quién realizó las pruebas (puede no ser el asignado)" placeholder="Seguridad TIC · M. López" {...form.getInputProps('responsableEjecucion')} />
        </SimpleGrid>
        {tardia && (
          <Alert color="orange" variant="light">
            Las pruebas son posteriores a la fecha planificada. Se permite cerrar, justificando el retraso en las observaciones.
          </Alert>
        )}
      </BloqueEjecucionCierre>
      <ConfirmarCierreEvaluacionModal resumen={porCerrar} enviando={cerrar.isPending} onConfirmar={confirmarCierre} onCerrar={() => setPorCerrar(null)} />
    </form>
  )
}

function ReabrirModal({ e, opened, onClose }: { e: EvaluacionSistema; opened: boolean; onClose: () => void }) {
  const reabrir = useReabrirEvaluacion()
  return (
    <ModalReabrir
      abierto={opened}
      onCerrar={onClose}
      titulo="Reabrir la evaluación"
      explicacion={<>Vuelve a <b>En progreso</b> con sus datos, para corregirlos. El cierre anterior queda en el historial.</>}
      validar={errorMotivo}
      enviando={reabrir.isPending}
      onConfirmar={(motivo) =>
        reabrir.mutate({ id: e.id, motivo }, { onSuccess: () => { aviso('Evaluación reabierta', 'Vuelve a En progreso.'); onClose() }, onError: fallo('No se pudo reabrir') })
      }
    />
  )
}

/** Ficha de una evaluación: planificación, ejecución y cierre, e historial. */
export function EvaluacionPage() {
  const id = Number(useParams().id)
  const consulta = useEvaluacion(id)
  const puedeOperar = usePuedeOperar()
  const esAdmin = usePuedeAdministrar()
  const [historial, verHistorial] = useDisclosure()
  const [reabriendo, reapertura] = useDisclosure()
  if (consulta.isPending) return <Center py="xl"><Loader /></Center>
  if (consulta.error) return <Alert color="red" title="No se pudo cargar la evaluación">{consulta.error.message}</Alert>
  const e = consulta.data
  const cerrada = e.estado === 'CERRADO'
  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Anchor component={Link} to={`/evaluacion-sistemas-productivos?pestana=${cerrada ? 'bitacora' : 'ejecucion'}`}>Evaluación de Sistemas Productivos</Anchor>
        <Text>Evaluación #{e.id}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Evaluación #{e.id} · {e.activo.codigo}</Title>
          <Group gap="xs" mt={4}>
            <BadgeEstadoEvaluacion e={e} />
            <Badge variant="outline" color={INFO_SITUACION[e.situacion].color}>{INFO_SITUACION[e.situacion].etiqueta}</Badge>
            <BadgeRegistro registro={e} />
          </Group>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconHistory size={16} />} onClick={verHistorial.open}>Historial</Button>
          {esAdmin && cerrada && !e.anuladoEn && (
            <Button variant="light" color="orange" leftSection={<IconRotateClockwise size={16} />} onClick={reapertura.open}>Reabrir</Button>
          )}
        </Group>
      </Group>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">1 · Planificación</Title>
        <DatosPlanificacionEvaluacion e={e} />
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">2 · Ejecución y cierre</Title>
        {cerrada || !puedeOperar || e.anuladoEn ? <DatosEjecucionEvaluacion e={e} /> : <FormEjecucion key={e.version} e={e} />}
      </Card>

      <TrazasModal abierto={historial} entidad="EVALUACION_SISTEMA" registroId={e.id} titulo={`Historial · evaluación #${e.id}`} etiquetas={ETIQUETAS_TRAZA} onCerrar={verHistorial.close} />
      {esAdmin && <ReabrirModal e={e} opened={reabriendo} onClose={reapertura.close} />}
    </Stack>
  )
}
