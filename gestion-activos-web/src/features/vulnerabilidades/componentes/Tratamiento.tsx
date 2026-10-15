import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import {
  useEvaluarVulnerabilidad,
  useRegistrarAccion,
  useVerificarVulnerabilidad,
  type NivelRiesgo,
  type Prioridad,
  type ResultadoVerificacion,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { INFO_NIVEL, INFO_PRIORIDAD, NIVELES, PRIORIDADES } from '../riesgo.ts'

const largo = (min: number, max: number, etiqueta: string) => (v: string) =>
  v.trim().length < min ? `${etiqueta}: mínimo ${min} caracteres` : v.length > max ? `Máximo ${max} caracteres` : null
const error = (titulo: string) => (e: Error) => notifications.show({ color: 'red', title: titulo, message: e.message })

// ── Capa 2 · Evaluación ─────────────────────────────────────────────────────

/** Prioridad, responsable y plan de remediación; puede reajustar el riesgo y el plazo. */
export function EvaluarModal({ opened, onClose, vulnerabilidad }: { opened: boolean; onClose: () => void; vulnerabilidad: Vulnerabilidad }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Evaluar y planificar la remediación" size="lg">
      {opened && <FormEvaluar onClose={onClose} v={vulnerabilidad} />}
    </Modal>
  )
}

function FormEvaluar({ onClose, v }: { onClose: () => void; v: Vulnerabilidad }) {
  const evaluar = useEvaluarVulnerabilidad()
  const form = useForm<{ prioridad: Prioridad | null; responsable: string; planRemediacion: string; nivelRiesgo: NivelRiesgo; fechaLimite: string | null }>({
    initialValues: {
      prioridad: v.prioridad,
      responsable: v.responsable ?? '',
      planRemediacion: v.planRemediacion ?? '',
      nivelRiesgo: v.nivelRiesgo,
      fechaLimite: v.fechaLimite ? isoAFechaHoraLocal(v.fechaLimite) : null,
    },
    validate: {
      prioridad: (p) => (p ? null : 'Indica la prioridad'),
      responsable: (r) => (!r.trim() ? 'Indica el responsable' : r.length > 191 ? 'Máximo 191' : null),
      planRemediacion: largo(10, 5000, 'Plan'),
      fechaLimite: (f) => (f && dayjs(f).isBefore(dayjs(v.fecha)) ? 'No puede ser anterior a la detección' : null),
    },
  })
  const enviar = form.onSubmit((x) =>
    evaluar.mutate(
      {
        id: v.id,
        datos: {
          prioridad: x.prioridad!,
          responsable: x.responsable.trim(),
          planRemediacion: x.planRemediacion.trim(),
          nivelRiesgo: x.nivelRiesgo !== v.nivelRiesgo ? x.nivelRiesgo : undefined,
          fechaLimite: x.fechaLimite ? fechaHoraLocalAIso(x.fechaLimite) : undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'blue', title: 'Evaluación registrada', message: 'Ya se puede iniciar el tratamiento.' })
          onClose()
        },
        onError: error('No se pudo evaluar'),
      },
    ),
  )
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Prioridad"
            withAsterisk
            data={PRIORIDADES.map((p) => ({ value: p, label: INFO_PRIORIDAD[p].etiqueta }))}
            {...form.getInputProps('prioridad')}
          />
          <TextInput label="Responsable de la remediación" withAsterisk placeholder="Seguridad TIC" {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Textarea
          label="Plan de remediación"
          withAsterisk
          autosize
          minRows={3}
          placeholder="Aplicar el parche del fabricante en la ventana del sábado; mientras tanto, bloquear el puerto en el firewall."
          {...form.getInputProps('planRemediacion')}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Nivel de riesgo (reajuste tras la evaluación)
          </Text>
          <SegmentedControl
            fullWidth
            color={INFO_NIVEL[form.values.nivelRiesgo].color}
            data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
            {...form.getInputProps('nivelRiesgo')}
          />
        </div>
        <DateTimePicker
          label="Fecha límite (SLA)"
          valueFormat="DD MMM YYYY HH:mm"
          minDate={new Date(v.fecha)}
          clearable
          {...form.getInputProps('fechaLimite')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={evaluar.isPending || evaluar.isSuccess}>
            Guardar evaluación
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

// ── Capa 2 · Acción correctiva ──────────────────────────────────────────────

export function AccionModal({ opened, onClose, vulnerabilidad }: { opened: boolean; onClose: () => void; vulnerabilidad: Vulnerabilidad }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Registrar acción correctiva" size="lg">
      {opened && <FormAccion onClose={onClose} v={vulnerabilidad} />}
    </Modal>
  )
}

function FormAccion({ onClose, v }: { onClose: () => void; v: Vulnerabilidad }) {
  const registrar = useRegistrarAccion()
  const form = useForm({
    initialValues: { fecha: ahoraLocal() as string | null, descripcion: '', responsable: v.responsable ?? '', evidencia: '' },
    validate: {
      fecha: (f) => (!f ? 'Indica la fecha' : dayjs(f).isBefore(dayjs(v.fecha)) ? 'No puede ser anterior a la detección' : null),
      descripcion: largo(5, 5000, 'Descripción'),
      responsable: (r) => (!r.trim() ? 'Indica quién la aplicó' : null),
      evidencia: (e) => (e.length > 191 ? 'Máximo 191' : null),
    },
  })
  const enviar = form.onSubmit((x) =>
    registrar.mutate(
      {
        id: v.id,
        datos: {
          fecha: fechaHoraLocalAIso(x.fecha!),
          descripcion: x.descripcion.trim(),
          responsable: x.responsable.trim(),
          evidencia: x.evidencia.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', title: 'Acción registrada', message: 'Cuando se compruebe el resultado, registre la verificación.' })
          onClose()
        },
        onError: error('No se pudo registrar la acción'),
      },
    ),
  )
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Textarea label="Acción aplicada" withAsterisk autosize minRows={2} placeholder="Actualizado OpenSSL a 3.0.15 y reiniciado el servicio." {...form.getInputProps('descripcion')} />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <DateTimePicker label="Fecha" valueFormat="DD MMM YYYY HH:mm" maxDate={new Date()} withAsterisk {...form.getInputProps('fecha')} />
          <TextInput label="Responsable" withAsterisk {...form.getInputProps('responsable')} />
          <TextInput label="Evidencia" placeholder="Ticket, registro de cambios…" {...form.getInputProps('evidencia')} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={registrar.isPending || registrar.isSuccess}>
            Registrar acción
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

// ── Capa 3 · Verificación ───────────────────────────────────────────────────

/**
 * CORREGIDA cierra la vulnerabilidad (exige al menos una acción); PERSISTE la
 * mantiene en tratamiento o, si estaba cerrada, la reabre y genera un aviso.
 */
export function VerificarModal({
  opened,
  onClose,
  vulnerabilidad,
  accionesVigentes,
}: {
  opened: boolean
  onClose: () => void
  vulnerabilidad: Vulnerabilidad
  accionesVigentes: number
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Registrar verificación" size="lg">
      {opened && <FormVerificar onClose={onClose} v={vulnerabilidad} accionesVigentes={accionesVigentes} />}
    </Modal>
  )
}

function FormVerificar({ onClose, v, accionesVigentes }: { onClose: () => void; v: Vulnerabilidad; accionesVigentes: number }) {
  const verificar = useVerificarVulnerabilidad()
  const cerrada = v.estado === 'MITIGADA'
  const form = useForm<{ resultado: ResultadoVerificacion; fecha: string | null; observaciones: string; evidencia: string; responsable: string }>({
    // Sobre una cerrada solo cabe comprobar que persiste (la reabre).
    initialValues: { resultado: cerrada ? 'PERSISTE' : 'CORREGIDA', fecha: ahoraLocal(), observaciones: '', evidencia: '', responsable: '' },
    validate: {
      fecha: (f) => (f ? null : 'Indica la fecha'),
      observaciones: largo(10, 5000, 'Observaciones'),
      evidencia: (e) => (e.trim().length < 3 ? 'La verificación exige evidencia (mínimo 3 caracteres)' : e.length > 191 ? 'Máximo 191' : null),
      responsable: (r) => (!r.trim() ? 'Indica quién verificó' : null),
    },
  })
  const sinAcciones = form.values.resultado === 'CORREGIDA' && accionesVigentes === 0
  const enviar = form.onSubmit((x) =>
    verificar.mutate(
      {
        id: v.id,
        datos: {
          resultado: x.resultado,
          fecha: fechaHoraLocalAIso(x.fecha!),
          observaciones: x.observaciones.trim(),
          evidencia: x.evidencia.trim(),
          responsable: x.responsable.trim(),
        },
      },
      {
        onSuccess: () => {
          notifications.show(
            x.resultado === 'CORREGIDA'
              ? { color: 'green', title: 'Vulnerabilidad cerrada', message: 'La verificación confirmó la corrección.' }
              : cerrada
                ? { color: 'orange', title: 'Vulnerabilidad reabierta', message: 'Vuelve a tratamiento; se generó un aviso.' }
                : { color: 'orange', title: 'Persiste', message: 'Sigue en tratamiento: registre nuevas acciones.' },
          )
          onClose()
        },
        onError: error('No se pudo registrar la verificación'),
      },
    ),
  )
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          data={[
            { value: 'CORREGIDA', label: 'Corregida (cierra)', disabled: cerrada },
            { value: 'PERSISTE', label: cerrada ? 'Persiste (reabre)' : 'Persiste' },
          ]}
          color={form.values.resultado === 'CORREGIDA' ? 'green' : 'orange'}
          {...form.getInputProps('resultado')}
        />
        {sinAcciones && (
          <Alert color="orange" title="No se puede cerrar todavía">
            No hay acciones correctivas vigentes: registre al menos una antes de verificar la corrección.
          </Alert>
        )}
        <Textarea label="Observaciones" withAsterisk autosize minRows={2} placeholder="Nuevo escaneo sin hallazgos en el puerto 443." {...form.getInputProps('observaciones')} />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <DateTimePicker label="Fecha" valueFormat="DD MMM YYYY HH:mm" maxDate={new Date()} withAsterisk {...form.getInputProps('fecha')} />
          <TextInput label="Evidencia" withAsterisk placeholder="Informe de escaneo 2026-10-14" {...form.getInputProps('evidencia')} />
          <TextInput label="Verificado por" withAsterisk {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color={form.values.resultado === 'CORREGIDA' ? 'green' : 'orange'} loading={verificar.isPending || verificar.isSuccess} disabled={sinAcciones}>
            Registrar verificación
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
