import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEditarRespaldo, type Respaldo } from '../api/respaldos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  respaldo: Respaldo
}

/** Corrige el alcance (capa 1). Solo mientras la ejecución está pendiente. */
export function EditarRespaldoModal({ opened, onClose, respaldo }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Editar el respaldo #${respaldo.id}`} size="lg">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <Formulario onClose={onClose} respaldo={respaldo} />
    </Modal>
  )
}

function Formulario({ onClose, respaldo }: Omit<Props, 'opened'>) {
  const editar = useEditarRespaldo()
  const form = useForm({
    initialValues: { alcanceDetalle: respaldo.alcanceDetalle },
    validate: {
      alcanceDetalle: (v) =>
        !v.trim() ? 'Describe el alcance' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null,
    },
  })

  const enviar = form.onSubmit((v) =>
    editar.mutate(
      { id: respaldo.id, datos: { alcanceDetalle: v.alcanceDetalle.trim() } },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: 'Respaldo actualizado',
            message: 'Se guardó el nuevo alcance.',
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          El alcance solo se puede corregir mientras la ejecución está pendiente.
        </Text>
        <Textarea
          label="Alcance"
          withAsterisk
          autosize
          minRows={3}
          data-autofocus
          {...form.getInputProps('alcanceDetalle')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={editar.isPending} disabled={!form.isDirty()}>
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
