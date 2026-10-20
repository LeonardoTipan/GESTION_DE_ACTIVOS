import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { CampoExcepcion } from '../../../shared/plazos/componentes.tsx'
import { avisoFueraDePlazo, fmt, errorExcepcion } from '../../../shared/plazos/plazos.ts'
import { useIniciarMantenimiento, type Mantenimiento } from '../api/mantenimientos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/** Capa 2 · PROGRAMADO → EN_EJECUCION, con la fecha real de inicio. */
export function IniciarModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Iniciar mantenimiento" size="lg">
      <FormIniciar onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

/** Sin límite (registros anteriores a los plazos) no hay intervalo que comprobar, igual que en la API. */
function fueraDelPlazo(m: Mantenimiento, real: string | null) {
  return m.fechaLimite ? avisoFueraDePlazo('El inicio real', real, m.fecha, m.fechaLimite) : null
}

function FormIniciar({ onClose, mantenimiento: m }: Omit<Props, 'opened'>) {
  const iniciar = useIniciarMantenimiento()
  const form = useForm({
    initialValues: { fechaInicio: ahoraLocal() as string | null, tecnico: '', motivoExcepcion: '' },
    validate: {
      fechaInicio: (v) => (v ? null : 'Indica cuándo empezó'),
      tecnico: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      motivoExcepcion: (v, valores) => errorExcepcion(fueraDelPlazo(m, valores.fechaInicio), v),
    },
  })
  const fuera = fueraDelPlazo(m, form.values.fechaInicio)

  const enviar = form.onSubmit((v) =>
    iniciar.mutate(
      {
        id: m.id,
        datos: {
          fechaInicio: fechaHoraLocalAIso(v.fechaInicio!),
          tecnico: v.tecnico.trim() || undefined,
          motivoExcepcion: fuera ? v.motivoExcepcion.trim() : undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'yellow',
            title: 'Mantenimiento en ejecución',
            message: 'Cuando termine, regístralo con "Finalizar".',
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo iniciar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          El mantenimiento pasará a <b>En ejecución</b>. Previsto: {fmt(m.fecha)} → {fmt(m.fechaLimite)}.
        </Text>
        <DateTimePicker
          label="Fecha y hora real de inicio"
          valueFormat="DD MMM YYYY HH:mm"
          maxDate={ahoraLocal()}
          withAsterisk
          {...form.getInputProps('fechaInicio')}
        />
        <CampoExcepcion
          fuera={fuera}
          value={form.values.motivoExcepcion}
          onChange={(v) => form.setFieldValue('motivoExcepcion', v)}
          error={form.errors.motivoExcepcion as string | undefined}
        />
        <TextInput
          label="Técnico asignado"
          placeholder="Usuario o nombre de quien ejecuta"
          description="Se puede indicar también al finalizar; es obligatorio para cerrarlo."
          {...form.getInputProps('tecnico')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="yellow" loading={iniciar.isPending || iniciar.isSuccess}>
            Iniciar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
