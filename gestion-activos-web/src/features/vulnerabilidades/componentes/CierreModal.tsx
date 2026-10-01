import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconShieldExclamation } from '@tabler/icons-react'
import { useAceptarRiesgo, useMitigarVulnerabilidad } from '../api/vulnerabilidades.ts'

/** Tope de los campos de texto largo (el mismo que aplica la API). */
const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  vulnerabilidadId: number
  /** mitigar: EN_MITIGACION → MITIGADA · aceptar: → ACEPTADA (solo admin). */
  modo: 'mitigar' | 'aceptar'
}

/**
 * Cierre de una vulnerabilidad. Ambos caminos guardan su texto en el mismo
 * campo de la BD (`mitigacion`) y la API pone `fechaCierre` automáticamente.
 */
export function CierreModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={resto.modo === 'mitigar' ? 'Marcar como mitigada' : 'Aceptar el riesgo'}
      size="lg"
    >
      <FormCierre onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormCierre({ onClose, vulnerabilidadId, modo }: Omit<Props, 'opened'>) {
  const mitigar = useMitigarVulnerabilidad()
  const aceptar = useAceptarRiesgo()
  const enCurso = mitigar.isPending || aceptar.isPending
  const form = useForm({
    initialValues: { texto: '' },
    validate: {
      texto: (v) =>
        !v.trim()
          ? modo === 'mitigar'
            ? 'Describe la acción aplicada'
            : 'La justificación es obligatoria'
          : v.trim().length > MAX_TEXTO_LARGO
            ? `Máximo ${MAX_TEXTO_LARGO} caracteres`
            : null,
    },
  })

  const alTerminar = {
    onSuccess: () => {
      notifications.show(
        modo === 'mitigar'
          ? { color: 'green', title: 'Vulnerabilidad mitigada', message: 'Ciclo cerrado.' }
          : { color: 'grape', title: 'Riesgo aceptado', message: 'Queda documentado con su justificación.' },
      )
      onClose()
    },
    onError: (e: Error) =>
      notifications.show({ color: 'red', title: 'No se pudo cerrar', message: e.message }),
  }

  const enviar = form.onSubmit(({ texto }) =>
    modo === 'mitigar'
      ? mitigar.mutate({ id: vulnerabilidadId, datos: { mitigacion: texto.trim() } }, alTerminar)
      : aceptar.mutate(
          { id: vulnerabilidadId, datos: { justificacion: texto.trim() } },
          alTerminar,
        ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        {modo === 'aceptar' ? (
          <Alert color="grape" icon={<IconShieldExclamation size={18} />}>
            Aceptar el riesgo cierra la vulnerabilidad <b>sin remediarla</b>. Es una decisión
            formal del administrador y queda registrada con su justificación.
          </Alert>
        ) : (
          <Text size="sm" c="dimmed">
            La vulnerabilidad pasará a <b>Mitigada</b> y se registrará la fecha de cierre.
          </Text>
        )}
        <Textarea
          label={modo === 'mitigar' ? 'Mitigación aplicada' : 'Justificación'}
          placeholder={
            modo === 'mitigar'
              ? 'Actualizado OpenSSL a 3.0.15 y reiniciado el servicio; verificado con escaneo.'
              : 'Sistema heredado sin parche del fabricante; aislado en VLAN sin acceso a Internet. Se reevalúa en 6 meses.'
          }
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
          <Button type="submit" color={modo === 'mitigar' ? 'green' : 'grape'} loading={enCurso}>
            {modo === 'mitigar' ? 'Marcar como mitigada' : 'Aceptar riesgo'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
