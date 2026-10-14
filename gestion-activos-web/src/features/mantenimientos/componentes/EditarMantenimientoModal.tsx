import { Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoMotivoCambio } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import {
  useEditarMantenimiento,
  type Mantenimiento,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { INFO_TIPO, TIPOS } from '../fases.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/** Reprograma o corrige un mantenimiento. Solo mientras está PROGRAMADO. */
export function EditarMantenimientoModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Editar el mantenimiento #${mantenimiento.id}`}
      size="lg"
    >
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <Formulario onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

function Formulario({ onClose, mantenimiento }: Omit<Props, 'opened'>) {
  const editar = useEditarMantenimiento()
  const form = useForm<{ tipo: TipoMantenimiento; actividad: string; fecha: string | null; motivoCambio: string }>({
    initialValues: {
      tipo: mantenimiento.tipo,
      actividad: mantenimiento.actividad,
      fecha: isoAFechaHoraLocal(mantenimiento.fecha),
      motivoCambio: '',
    },
    validate: {
      motivoCambio: errorMotivo,
      actividad: (v) =>
        !v.trim()
          ? 'Describe la actividad'
          : v.trim().length > 191
            ? 'Máximo 191 caracteres'
            : null,
      fecha: (v) => (v ? null : 'Indica la fecha programada'),
    },
  })

  const enviar = form.onSubmit((v) =>
    editar.mutate(
      {
        id: mantenimiento.id,
        datos: {
          tipo: v.tipo,
          actividad: v.actividad.trim(),
          fecha: fechaHoraLocalAIso(v.fecha!),
          motivoCambio: v.motivoCambio.trim(),
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: 'Mantenimiento actualizado',
            message: 'Se guardó una nueva versión; la anterior queda en las trazas.',
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
          Solo se puede editar mientras está programado. El activo no se puede cambiar: si te
          equivocaste de activo, anula este mantenimiento y programa otro.
        </Text>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Tipo
          </Text>
          <SegmentedControl
            data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
            {...form.getInputProps('tipo')}
          />
        </div>
        <Textarea
          label="Actividad"
          withAsterisk
          autosize
          minRows={2}
          {...form.getInputProps('actividad')}
        />
        <DateTimePicker
          label="Fecha programada"
          valueFormat="DD MMM YYYY HH:mm"
          withAsterisk
          {...form.getInputProps('fecha')}
        />
        <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />
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
