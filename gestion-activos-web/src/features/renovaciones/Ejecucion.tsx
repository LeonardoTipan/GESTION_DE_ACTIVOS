import { Alert, Button, Card, Group, SimpleGrid, Stack, Switch, Text, Textarea, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconEdit, IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'
import { useState } from 'react'
import { BloqueEjecucionCierre } from '../../shared/cierre/BloqueEjecucionCierre.tsx'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { Dato, EnlaceRepositorio as Repositorio, ModalReabrir } from '../../shared/cierre/componentes.tsx'
import { errorRepositorio } from '../../shared/evidencia.ts'
import { formatearFecha, hoyLocal, isoADia } from '../../shared/formato.ts'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import { useCerrar, useGuardarEjecucion, useIniciar, useReabrir, type Renovacion } from './api.ts'
import { BadgeEstado, BadgeVigencia } from './componentes.tsx'
import { accionesPermitidas, faltantesCierre } from './textos.ts'

/** CERRADO → EN_PROGRESO con motivo (las fechas anteriores quedan en la auditoría). */
function ReabrirModal({ r, opened, onClose }: { r: Renovacion; opened: boolean; onClose: () => void }) {
  const reabrir = useReabrir()
  return (
    <ModalReabrir
      abierto={opened}
      onCerrar={onClose}
      titulo="Reabrir la renovación"
      explicacion={
        <>
          Vuelve a <b>En progreso</b>. Se vacían la fecha de renovación y la nueva caducidad vigentes; las anteriores, con
          quién las registró, se conservan en la auditoría.
        </>
      }
      validar={errorMotivo}
      enviando={reabrir.isPending}
      onConfirmar={(motivo) =>
        reabrir.mutate(
          { id: r.id, motivo },
          {
            onSuccess: () => {
              aviso('Renovación reabierta', 'Vuelve a En progreso; la ejecución anterior queda en la auditoría.')
              onClose()
            },
            onError: fallo('No se pudo reabrir'),
          },
        )
      }
    />
  )
}

interface Valores {
  fechaRenovacion: string | null
  nuevaFechaCaducidad: string | null
  nuevaSinCaducidad: boolean
  evidencia: string
  repositorioVerificable: string
  descripcion: string
  observacion: string
  motivoCambio: string
}

/**
 * Formulario de ejecución. Pendiente: guardar sin cerrar o cerrar (exige fecha real,
 * nueva caducidad, verificable y repositorio). Cerrada: corrección (solo admin, con motivo).
 */
function FormEjecucion({ r, correccion, onListo }: { r: Renovacion; correccion: boolean; onListo?: () => void }) {
  const guardar = useGuardarEjecucion()
  const cerrar = useCerrar()
  const form = useForm<Valores>({
    initialValues: {
      fechaRenovacion: r.fechaRenovacion ? isoADia(r.fechaRenovacion) : null,
      nuevaFechaCaducidad: r.nuevaFechaCaducidad ? isoADia(r.nuevaFechaCaducidad) : null,
      nuevaSinCaducidad: r.nuevaSinCaducidad,
      evidencia: r.evidencia ?? '',
      repositorioVerificable: r.repositorioVerificable ?? '',
      descripcion: r.descripcion ?? '',
      observacion: r.observacion ?? '',
      motivoCambio: '',
    },
    validate: {
      fechaRenovacion: (v) => (v && v > hoyLocal() ? 'No puede ser futura' : null),
      nuevaFechaCaducidad: (v, x) =>
        v && x.fechaRenovacion && v <= x.fechaRenovacion
          ? 'Debe ser posterior a la fecha real de renovación'
          : v && r.fechaCaducidadActual && v <= isoADia(r.fechaCaducidadActual)
            ? 'Debe ser posterior a la caducidad actual'
            : null,
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
      motivoCambio: (v) => (correccion ? errorMotivo(v) : null),
    },
  })
  const datos = (x: Valores) => ({
    fechaRenovacion: x.fechaRenovacion ?? undefined,
    nuevaFechaCaducidad: x.nuevaSinCaducidad ? undefined : (x.nuevaFechaCaducidad ?? undefined),
    nuevaSinCaducidad: x.nuevaSinCaducidad,
    evidencia: x.evidencia.trim() || undefined,
    repositorioVerificable: x.repositorioVerificable.trim() || undefined,
    descripcion: x.descripcion.trim() || undefined,
    observacion: x.observacion.trim() || undefined,
  })

  const enviar = form.onSubmit((x) =>
    guardar.mutate(
      { id: r.id, datos: { ...datos(x), motivoCambio: correccion ? x.motivoCambio.trim() : undefined } },
      {
        onSuccess: () => {
          aviso(correccion ? 'Ejecución corregida' : 'Datos guardados', correccion ? 'El cambio queda en la auditoría.' : 'El estado no cambia hasta cerrar la renovación.')
          form.resetDirty()
          onListo?.()
        },
        onError: fallo('No se pudo guardar'),
      },
    ),
  )

  const cerrarRenovacion = () => {
    if (form.validate().hasErrors) return
    const x = form.getValues()
    const faltan = faltantesCierre(x)
    if (faltan.length) {
      form.setErrors({
        ...(x.fechaRenovacion ? {} : { fechaRenovacion: 'Obligatoria para cerrar' }),
        ...(x.nuevaSinCaducidad || x.nuevaFechaCaducidad ? {} : { nuevaFechaCaducidad: 'Obligatoria para cerrar (o marque «sin caducidad»)' }),
        ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para cerrar' }),
        ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para cerrar' }),
        ...(x.nuevaSinCaducidad && !x.observacion.trim() ? { observacion: 'Justifique por qué no tiene caducidad' } : {}),
      })
      notifications.show({ color: 'orange', title: 'No se puede cerrar todavía', message: `Falta ${faltan.join(', ')}.` })
      return
    }
    cerrar.mutate({ id: r.id, datos: datos(x) }, { onSuccess: () => aviso('Renovación cerrada', 'Rige la nueva fecha de caducidad.'), onError: fallo('No se pudo cerrar') })
  }

  return (
    <form onSubmit={enviar} noValidate>
      <BloqueEjecucionCierre
        verificable={{ description: 'Contrato, factura, certificado renovado o informe', placeholder: 'Informe de Satisfacción del Contrato de Renovación', ...form.getInputProps('evidencia') }}
        repositorio={{ description: 'Carpeta compartida o URL http(s) (no se guardan archivos)', placeholder: 'Carpeta Compartida TICs/Interno', ...form.getInputProps('repositorioVerificable') }}
        detalle={<Textarea label="Descripción" description="Detalle de la renovación realizada" autosize minRows={2} {...form.getInputProps('descripcion')} />}
        observacion={form.getInputProps('observacion')}
        motivoCambio={correccion ? form.getInputProps('motivoCambio') : undefined}
        guardar={{ etiqueta: correccion ? 'Guardar corrección' : 'Guardar sin cerrar', cargando: guardar.isPending, deshabilitado: !form.isDirty(), principal: correccion }}
        cerrar={correccion ? undefined : { etiqueta: 'Cerrar renovación', cargando: cerrar.isPending, onClick: cerrarRenovacion }}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DatePickerInput
            label="Fecha real de renovación"
            description="Cuándo se renovó REALMENTE (puede ser anterior a hoy; no futura)"
            placeholder="Elija el día"
            valueFormat="DD MMM YYYY"
            clearable
            maxDate={hoyLocal()}
            {...form.getInputProps('fechaRenovacion')}
          />
          <DatePickerInput
            label="Nueva fecha de caducidad"
            description="Hasta cuándo vale después de renovar"
            placeholder="Elija el día"
            valueFormat="DD MMM YYYY"
            clearable
            disabled={form.values.nuevaSinCaducidad}
            minDate={form.values.fechaRenovacion ?? undefined}
            {...form.getInputProps('nuevaFechaCaducidad')}
          />
        </SimpleGrid>
        <Switch
          label="La nueva vigencia no tiene caducidad"
          description="Por ejemplo, se adquirió una licencia perpetua. Exige justificarlo en la observación."
          checked={form.values.nuevaSinCaducidad}
          onChange={(e) => {
            form.setFieldValue('nuevaSinCaducidad', e.currentTarget.checked)
            if (e.currentTarget.checked) form.setFieldValue('nuevaFechaCaducidad', null)
          }}
        />
      </BloqueEjecucionCierre>
    </form>
  )
}

/** Fase 2 · Ejecución y cierre (el mismo registro que la planificación). */
export function Ejecucion({ r }: { r: Renovacion }) {
  const puedeOperar = usePuedeOperar()
  const esAdmin = usePuedeAdministrar()
  const iniciar = useIniciar()
  const [reabriendo, reapertura] = useDisclosure()
  const [corrigiendo, setCorrigiendo] = useState(false)
  const anulada = r.anuladoEn !== null
  const acciones = anulada || !puedeOperar ? [] : accionesPermitidas(r)
  const cerrada = r.estado === 'CERRADO'

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Group gap="sm">
          <Title order={4}>2 · Ejecución y cierre</Title>
          <BadgeEstado estado={r.estado} />
          <BadgeVigencia r={r} />
        </Group>
        <Group gap="sm">
          {acciones.includes('iniciar') && (
            <Button
              color="yellow"
              leftSection={<IconPlayerPlay size={16} />}
              loading={iniciar.isPending}
              onClick={() => iniciar.mutate(r.id, { onSuccess: () => aviso('Renovación en progreso', 'Registre la ejecución y ciérrela.'), onError: fallo('No se pudo iniciar') })}
            >
              Iniciar ejecución
            </Button>
          )}
          {acciones.includes('reabrir') && (
            <Button color="orange" variant="light" leftSection={<IconRotateClockwise size={16} />} onClick={reapertura.open}>
              Reabrir
            </Button>
          )}
          {cerrada && esAdmin && !anulada && !corrigiendo && (
            <Button variant="light" leftSection={<IconEdit size={16} />} onClick={() => setCorrigiendo(true)}>
              Corregir ejecución
            </Button>
          )}
        </Group>
      </Group>

      {cerrada && !corrigiendo ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Fecha real de renovación">{formatearFecha(r.fechaRenovacion)}</Dato>
            <Dato etiqueta="Caducidad anterior">{r.sinCaducidadActual ? 'Sin caducidad' : formatearFecha(r.fechaCaducidadActual)}</Dato>
            <Dato etiqueta="Nueva caducidad">{r.nuevaSinCaducidad ? 'Sin caducidad' : formatearFecha(r.nuevaFechaCaducidad)}</Dato>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Dato etiqueta="Verificable">{r.evidencia ?? '—'}</Dato>
            <Dato etiqueta="Repositorio verificable">
              <Repositorio valor={r.repositorioVerificable} />
            </Dato>
          </SimpleGrid>
          <Dato etiqueta="Descripción">{r.descripcion ?? '—'}</Dato>
          <Dato etiqueta="Observación">{r.observacion ?? '—'}</Dato>
          <Text size="xs" c="dimmed">
            Cerrada por {r.cerradaPor ?? '—'}. La evidencia se exigió al cerrar: no hay una fase de verificación aparte.
          </Text>
        </Stack>
      ) : acciones.includes('cerrar') || corrigiendo ? (
        <>
          {!corrigiendo && (
            <Alert color="blue" variant="light" mb="sm">
              Para cerrar se exigen la <b>fecha real</b> de renovación, la <b>nueva caducidad</b> (o «sin caducidad»
              justificado), el <b>verificable</b> y su <b>repositorio</b>. Puede guardarlos antes sin cerrar. La caducidad
              actual ({r.sinCaducidadActual ? 'sin caducidad' : formatearFecha(r.fechaCaducidadActual)}) se conserva.
            </Alert>
          )}
          <FormEjecucion r={r} correccion={corrigiendo} onListo={() => setCorrigiendo(false)} />
          {corrigiendo && (
            <Button variant="subtle" mt="xs" onClick={() => setCorrigiendo(false)}>
              Cancelar la corrección
            </Button>
          )}
        </>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Dato etiqueta="Fecha real de renovación">{r.fechaRenovacion ? formatearFecha(r.fechaRenovacion) : 'No renovada'}</Dato>
          <Dato etiqueta="Nueva caducidad">{r.nuevaFechaCaducidad ? formatearFecha(r.nuevaFechaCaducidad) : '—'}</Dato>
          <Dato etiqueta="Verificable">{r.evidencia ?? '—'}</Dato>
        </SimpleGrid>
      )}
      <ReabrirModal r={r} opened={reabriendo} onClose={reapertura.close} />
    </Card>
  )
}
