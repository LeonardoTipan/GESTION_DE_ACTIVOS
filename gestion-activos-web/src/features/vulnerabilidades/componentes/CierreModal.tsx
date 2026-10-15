import { Alert, Button, Group, Modal, Stack, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconShieldExclamation } from '@tabler/icons-react'
import { useAceptarRiesgo } from '../api/vulnerabilidades.ts'

/** Tope de los campos de texto largo (el mismo que aplica la API). */
const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  vulnerabilidadId: number
}

/**
 * Aceptar el riesgo (solo admin): el único cierre sin verificación, porque no
 * hay remediación que verificar. La remediación solo la cierra una
 * verificación CORREGIDA (ver Tratamiento).
 */
export function AceptarRiesgoModal({ opened, onClose, vulnerabilidadId }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Aceptar el riesgo" size="lg">
      <FormAceptar onClose={onClose} vulnerabilidadId={vulnerabilidadId} />
    </Modal>
  )
}

function FormAceptar({ onClose, vulnerabilidadId }: Omit<Props, 'opened'>) {
  const aceptar = useAceptarRiesgo()
  const form = useForm({
    initialValues: { texto: '' },
    validate: {
      texto: (v) =>
        !v.trim()
          ? 'La justificación es obligatoria'
          : v.trim().length > MAX_TEXTO_LARGO
            ? `Máximo ${MAX_TEXTO_LARGO} caracteres`
            : null,
    },
  })

  const enviar = form.onSubmit(({ texto }) =>
    aceptar.mutate(
      { id: vulnerabilidadId, datos: { justificacion: texto.trim() } },
      {
        onSuccess: () => {
          notifications.show({ color: 'grape', title: 'Riesgo aceptado', message: 'Queda documentado con su justificación.' })
          onClose()
        },
        onError: (e: Error) => notifications.show({ color: 'red', title: 'No se pudo cerrar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Alert color="grape" icon={<IconShieldExclamation size={18} />}>
          Aceptar el riesgo cierra la vulnerabilidad <b>sin remediarla</b>. Es una decisión formal del administrador y
          queda registrada con su justificación.
        </Alert>
        <Textarea
          label="Justificación"
          placeholder="Sistema heredado sin parche del fabricante; aislado en VLAN sin acceso a Internet. Se reevalúa en 6 meses."
          withAsterisk
          autosize
          minRows={3}
          maxRows={10}
          data-autofocus
          {...form.getInputProps('texto')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="grape" loading={aceptar.isPending}>
            Aceptar riesgo
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
