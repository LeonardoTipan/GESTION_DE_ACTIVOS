import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useCancelarMantenimiento } from '../api/mantenimientos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimientoId: number
}

/** PROGRAMADO o EN_EJECUCION → CANCELADO. Es definitivo: exige motivo. */
export function CancelarModal({ opened, onClose, mantenimientoId }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Cancelar mantenimiento">
      <FormCancelar onClose={onClose} mantenimientoId={mantenimientoId} />
    </Modal>
  )
}

function FormCancelar({ onClose, mantenimientoId }: Omit<Props, 'opened'>) {
  const cancelar = useCancelarMantenimiento()
  const form = useForm({
    initialValues: { motivo: '' },
    validate: {
      motivo: (v) =>
        !v.trim()
          ? 'Indica el motivo de la cancelación'
          : v.trim().length > 191
            ? 'Máximo 191 caracteres'
            : null,
    },
  })

  const enviar = form.onSubmit((v) =>
    cancelar.mutate(
      { id: mantenimientoId, datos: { motivo: v.motivo.trim() } },
      {
        onSuccess: () => {
          notifications.show({ color: 'gray', title: 'Mantenimiento cancelado', message: v.motivo.trim() })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo cancelar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          La cancelación es <b>definitiva</b>: el mantenimiento no se podrá reanudar.
        </Text>
        <Textarea
          label="Motivo"
          placeholder="El proveedor reprogramó la visita."
          withAsterisk
          autosize
          minRows={2}
          data-autofocus
          {...form.getInputProps('motivo')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="red" loading={cancelar.isPending}>
            Cancelar mantenimiento
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
