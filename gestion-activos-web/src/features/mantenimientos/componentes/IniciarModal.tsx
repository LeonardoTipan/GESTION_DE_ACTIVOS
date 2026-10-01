import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { useIniciarMantenimiento } from '../api/mantenimientos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimientoId: number
}

/** PROGRAMADO → EN_EJECUCION. */
export function IniciarModal({ opened, onClose, mantenimientoId }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Iniciar mantenimiento">
      <FormIniciar onClose={onClose} mantenimientoId={mantenimientoId} />
    </Modal>
  )
}

function FormIniciar({ onClose, mantenimientoId }: Omit<Props, 'opened'>) {
  const iniciar = useIniciarMantenimiento()
  const form = useForm({
    initialValues: { fechaInicio: ahoraLocal() as string | null },
    validate: { fechaInicio: (v) => (v ? null : 'Indica cuándo empezó') },
  })

  const enviar = form.onSubmit((v) =>
    iniciar.mutate(
      { id: mantenimientoId, datos: { fechaInicio: fechaHoraLocalAIso(v.fechaInicio!) } },
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
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          El mantenimiento pasará a <b>En ejecución</b>.
        </Text>
        <DateTimePicker
          label="Fecha y hora de inicio"
          valueFormat="DD MMM YYYY HH:mm"
          maxDate={new Date()}
          withAsterisk
          {...form.getInputProps('fechaInicio')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="yellow" loading={iniciar.isPending}>
            Iniciar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
