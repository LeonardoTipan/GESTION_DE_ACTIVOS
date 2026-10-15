import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { useVerificarMantenimiento, type Mantenimiento, type ResultadoVerificacion } from '../api/mantenimientos.ts'
import { faltantesParaCerrar, INFO_RESULTADO_VERIFICACION, RESULTADOS_VERIFICACION } from '../fases.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/**
 * Capa 3 · Verificación posterior del trabajo. OPERATIVO lo cierra (exige
 * evidencia); REQUIERE_SEGUIMIENTO y NO_SATISFACTORIO lo dejan abierto, y el
 * segundo genera un aviso.
 */
export function VerificarModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Verificar el mantenimiento #${mantenimiento.id}`} size="lg">
      <FormVerificar onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

function FormVerificar({ onClose, mantenimiento: m }: Omit<Props, 'opened'>) {
  const verificar = useVerificarMantenimiento()
  const faltan = faltantesParaCerrar(m)
  const form = useForm<{
    resultado: ResultadoVerificacion
    fecha: string | null
    observaciones: string
    evidencia: string
    responsable: string
  }>({
    initialValues: { resultado: 'OPERATIVO', fecha: ahoraLocal(), observaciones: '', evidencia: '', responsable: '' },
    validate: {
      fecha: (v) =>
        !v
          ? 'Indica cuándo se verificó'
          : m.fechaFin && dayjs(v).isBefore(dayjs(m.fechaFin))
            ? 'No puede ser anterior al fin del mantenimiento'
            : null,
      observaciones: (v) => (v.trim().length < 10 ? 'Mínimo 10 caracteres' : v.length > 2000 ? 'Máximo 2000' : null),
      evidencia: (v, valores) =>
        valores.resultado === 'OPERATIVO' && !v.trim()
          ? 'Para cerrar como operativo se exige evidencia'
          : v.length > 191
            ? 'Máximo 191 caracteres'
            : null,
      responsable: (v) => (!v.trim() ? 'Indica quién verificó' : v.length > 191 ? 'Máximo 191' : null),
    },
  })

  const enviar = form.onSubmit((v) =>
    verificar.mutate(
      {
        id: m.id,
        datos: {
          resultado: v.resultado,
          fecha: fechaHoraLocalAIso(v.fecha!),
          observaciones: v.observaciones.trim(),
          evidencia: v.evidencia.trim() || undefined,
          responsable: v.responsable.trim(),
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: INFO_RESULTADO_VERIFICACION[v.resultado].color,
            title: 'Verificación registrada',
            message:
              v.resultado === 'OPERATIVO'
                ? 'El mantenimiento queda cerrado.'
                : v.resultado === 'NO_SATISFACTORIO'
                  ? 'Queda abierto y se generó un aviso.'
                  : 'Queda en seguimiento: registre otra verificación cuando corresponda.',
          })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo verificar', message: e.message }),
      },
    ),
  )

  const cerrando = form.values.resultado === 'OPERATIVO'
  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Resultado
          </Text>
          <SegmentedControl
            fullWidth
            data={RESULTADOS_VERIFICACION.map((r) => ({ value: r, label: INFO_RESULTADO_VERIFICACION[r].etiqueta }))}
            {...form.getInputProps('resultado')}
          />
        </div>
        {cerrando && faltan.length > 0 && (
          <Alert color="orange" title="No se puede cerrar como operativo">
            A la ejecución le falta: {faltan.join(', ')}. Registre otro resultado o complete la ejecución.
          </Alert>
        )}
        <Group grow align="flex-start">
          <DateTimePicker
            label="Fecha de la verificación"
            valueFormat="DD MMM YYYY HH:mm"
            minDate={m.fechaFin ? new Date(m.fechaFin) : undefined}
            maxDate={new Date()}
            withAsterisk
            {...form.getInputProps('fecha')}
          />
          <TextInput label="Verificado por" withAsterisk placeholder="Supervisor de TIC" {...form.getInputProps('responsable')} />
        </Group>
        <Textarea
          label="Observaciones"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Qué se comprobó y cómo quedó el equipo."
          {...form.getInputProps('observaciones')}
        />
        <TextInput
          label="Evidencia"
          withAsterisk={cerrando}
          placeholder="Acta de conformidad, informe o fotografía (referencia)"
          description="Referencia documental: la aplicación no almacena archivos."
          {...form.getInputProps('evidencia')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button
            type="submit"
            color={INFO_RESULTADO_VERIFICACION[form.values.resultado].color}
            loading={verificar.isPending}
            disabled={cerrando && faltan.length > 0}
          >
            Registrar verificación
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
