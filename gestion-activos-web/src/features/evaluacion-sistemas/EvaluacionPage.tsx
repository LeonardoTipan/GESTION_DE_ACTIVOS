import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconHistory, IconRotateClockwise } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import { BloqueEjecucionCierre } from '../../shared/cierre/BloqueEjecucionCierre.tsx'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { Dato, EnlaceRepositorio as Repositorio, ModalReabrir } from '../../shared/cierre/componentes.tsx'
import { errorRepositorio } from '../../shared/evidencia.ts'
import { ahoraLocal, fechaHoraLocalAIso, formatearFechaHora, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { BadgeRegistro, TrazasModal } from '../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import { useCerrarEvaluacion, useEvaluacion, useGuardarEjecucionEvaluacion, useReabrirEvaluacion, type EvaluacionSistema } from './api.ts'
import { INFO_ESTADO, INFO_SITUACION } from './textos.ts'

/** Nombres legibles de los campos, para el historial (trazas). */
const ETIQUETAS: Record<string, string> = {
  activoId: 'Sistema (activo)',
  fechaProgramadaProduccion: 'Paso a producción programado',
  responsable: 'Asignado',
  descripcion: 'Descripción planificada',
  estado: 'Estado',
  fechaPruebas: 'Fecha real de las pruebas',
  evidencia: 'Verificable (informe)',
  repositorioVerificable: 'Repositorio verificable',
  observacion: 'Observaciones',
  cerradoPor: 'Cerrada por',
}

/** Mínimo de la justificación de unas pruebas tardías (la regla del backend). */
const JUSTIFICACION_MINIMA = 20

interface Valores {
  fechaPruebas: string | null
  evidencia: string
  repositorioVerificable: string
  observacion: string
}

/** Fase 2 · ejecución y cierre: guardar avance (En progreso) o cerrar. */
function FormEjecucion({ e }: { e: EvaluacionSistema }) {
  const guardar = useGuardarEjecucionEvaluacion()
  const cerrar = useCerrarEvaluacion()
  const programada = isoAFechaHoraLocal(e.fechaProgramadaProduccion)
  const form = useForm<Valores>({
    initialValues: {
      fechaPruebas: e.fechaPruebas ? isoAFechaHoraLocal(e.fechaPruebas) : null,
      evidencia: e.evidencia ?? '',
      repositorioVerificable: e.repositorioVerificable ?? '',
      observacion: e.observacion ?? '',
    },
    validate: {
      fechaPruebas: (v) => (v && v > ahoraLocal() ? 'No puede ser futura' : null),
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
    },
  })
  const tardia = Boolean(form.values.fechaPruebas && form.values.fechaPruebas > programada)
  const datos = (x: Valores) => ({
    fechaPruebas: x.fechaPruebas ? fechaHoraLocalAIso(x.fechaPruebas) : undefined,
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
      ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para cerrar' }),
      ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para cerrar' }),
      ...(tardia && x.observacion.trim().length < JUSTIFICACION_MINIMA
        ? { observacion: `Las pruebas fueron posteriores al paso a producción programado: justifíquelo (mínimo ${JUSTIFICACION_MINIMA} caracteres)` }
        : {}),
    }
    if (Object.keys(faltan).length) {
      form.setErrors(faltan)
      notifications.show({ color: 'orange', title: 'No se puede cerrar todavía', message: 'Complete los campos marcados.' })
      return
    }
    cerrar.mutate({ id: e.id, datos: datos(x) }, { onSuccess: () => aviso('Evaluación cerrada', 'Queda en la bitácora por semestres.'), onError: fallo('No se pudo cerrar') })
  }
  return (
    <form onSubmit={enviar} noValidate>
      <BloqueEjecucionCierre
        verificable={{ label: 'Verificable (informe de las pruebas)', description: 'Nombre del informe; el veredicto vive en el informe y en las observaciones', placeholder: 'Informe de pruebas de seguridad nómina v2.1.pdf', ...form.getInputProps('evidencia') }}
        repositorio={{ description: 'Carpeta compartida o URL http(s) (no se guardan archivos)', placeholder: 'Carpeta Compartida TICs/Seguridad', ...form.getInputProps('repositorioVerificable') }}
        observacion={{
          label: 'Observaciones',
          description: tardia ? `Obligatoria (mínimo ${JUSTIFICACION_MINIMA} caracteres): las pruebas son posteriores al paso a producción programado.` : 'Resultado de las pruebas y hallazgos relevantes.',
          withAsterisk: tardia,
          ...form.getInputProps('observacion'),
        }}
        guardar={{ etiqueta: 'Guardar avance', cargando: guardar.isPending, deshabilitado: !form.isDirty() }}
        cerrar={{ etiqueta: 'Cerrar evaluación', cargando: cerrar.isPending, onClick: cerrarEvaluacion }}
      >
        <DateTimePicker
          label="Fecha real de las pruebas de seguridad"
          description={`Cuándo se hicieron REALMENTE (no futura). Paso a producción programado: ${formatearFechaHora(e.fechaProgramadaProduccion)}.`}
          placeholder="Elija fecha y hora"
          valueFormat="DD MMM YYYY HH:mm"
          clearable
          maxDate={ahoraLocal()}
          {...form.getInputProps('fechaPruebas')}
        />
        {tardia && (
          <Alert color="orange" variant="light">
            Las pruebas son posteriores a la fecha programada de paso a producción. Se permite cerrar, justificándolo en las observaciones.
          </Alert>
        )}
      </BloqueEjecucionCierre>
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

/** Ficha de una evaluación: fase 1 (planificación), fase 2 (ejecución y cierre) e historial. */
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
        <Anchor component={Link} to="/evaluacion-sistemas-productivos">Evaluación de Sistemas Productivos</Anchor>
        <Text>Evaluación #{e.id}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Evaluación #{e.id} · {e.activo.codigo}</Title>
          <Group gap="xs" mt={4}>
            <Badge variant="light" color={INFO_ESTADO[e.estado].color}>{INFO_ESTADO[e.estado].etiqueta}</Badge>
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
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Sistema">
              <Anchor component={Link} to={`/activos/${e.activoId}`} size="sm">{e.activo.codigo} · {e.activo.nombre}</Anchor>
              <Text size="xs" c="dimmed">{e.activo.categoria}</Text>
            </Dato>
            <Dato etiqueta="Paso a producción programado">
              <Text size="sm" c={e.vencida ? 'red' : undefined} fw={e.vencida ? 600 : undefined}>{formatearFechaHora(e.fechaProgramadaProduccion)}</Text>
              <Text size="xs" c="dimmed">Semestre planificado {e.semestrePlanificado}</Text>
            </Dato>
            <Dato etiqueta="Asignado">{e.responsable}</Dato>
          </SimpleGrid>
          <Dato etiqueta="Descripción planificada">{e.descripcion}</Dato>
          <Dato etiqueta="Registrada el (no es una fecha de negocio)">{formatearFechaHora(e.createdAt)}</Dato>
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">2 · Ejecución y cierre</Title>
        {cerrada || !puedeOperar || e.anuladoEn ? (
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Dato etiqueta="Fecha real de las pruebas">
                {formatearFechaHora(e.fechaPruebas)}
                {e.tardia && <Badge size="xs" color="orange" variant="light" ml={6}>Posterior a lo programado</Badge>}
              </Dato>
              <Dato etiqueta="Semestre real">{e.semestreReal ?? '—'}</Dato>
              <Dato etiqueta="Cerrada por">{e.cerradoPor ?? '—'}</Dato>
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Dato etiqueta="Verificable (informe)">{e.evidencia ?? '—'}</Dato>
              <Dato etiqueta="Repositorio verificable"><Repositorio valor={e.repositorioVerificable} /></Dato>
            </SimpleGrid>
            {e.observacion && <Dato etiqueta="Observaciones">{e.observacion}</Dato>}
          </Stack>
        ) : (
          <FormEjecucion key={e.version} e={e} />
        )}
      </Card>

      <TrazasModal abierto={historial} entidad="EVALUACION_SISTEMA" registroId={e.id} titulo={`Historial · evaluación #${e.id}`} etiquetas={ETIQUETAS} onCerrar={verHistorial.close} />
      {esAdmin && <ReabrirModal e={e} opened={reabriendo} onClose={reapertura.close} />}
    </Stack>
  )
}
