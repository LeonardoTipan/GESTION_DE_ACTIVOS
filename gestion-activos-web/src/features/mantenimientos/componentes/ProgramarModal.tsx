import { Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { SelectorActivo } from '../../inventario/componentes/SelectorActivo.tsx'
import {
  useProgramarMantenimiento,
  type Mantenimiento,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { INFO_TIPO, TIPOS } from '../fases.ts'

interface Props {
  opened: boolean
  onClose: () => void
  /** Activo preseleccionado (p. ej. si el listado está filtrado por activo). */
  activoInicial?: number
  onProgramado: (mantenimiento: Mantenimiento) => void
}

/** Crea un mantenimiento en fase PROGRAMADO. */
export function ProgramarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Programar mantenimiento" size="lg">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <FormProgramar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormProgramar({ onClose, activoInicial, onProgramado }: Omit<Props, 'opened'>) {
  const programar = useProgramarMantenimiento()
  const form = useForm<{
    activoId: number | null
    tipo: TipoMantenimiento
    actividad: string
    fecha: string | null
  }>({
    initialValues: {
      activoId: activoInicial ?? null,
      tipo: 'PREVENTIVO',
      actividad: '',
      fecha: null,
    },
    validate: {
      activoId: (v) => (v ? null : 'Elige el activo'),
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
    programar.mutate(
      {
        activoId: v.activoId!,
        tipo: v.tipo,
        actividad: v.actividad.trim(),
        fecha: fechaHoraLocalAIso(v.fecha!),
      },
      {
        onSuccess: (m) => {
          notifications.show({
            color: 'green',
            title: 'Mantenimiento programado',
            message: `${INFO_TIPO[m.tipo].etiqueta} para ${m.activo.codigo}.`,
          })
          onClose()
          onProgramado(m)
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo programar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <SelectorActivo
          label="Activo"
          placeholder="Busca por código o nombre"
          withAsterisk
          value={form.values.activoId}
          onChange={(id) => form.setFieldValue('activoId', id)}
          error={form.errors.activoId}
        />
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
          placeholder="Limpieza interna y actualización de firmware"
          withAsterisk
          autosize
          minRows={2}
          {...form.getInputProps('actividad')}
        />
        <DateTimePicker
          label="Fecha programada"
          description="Puede ser futura"
          valueFormat="DD MMM YYYY HH:mm"
          withAsterisk
          {...form.getInputProps('fecha')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={programar.isPending}>
            Programar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
