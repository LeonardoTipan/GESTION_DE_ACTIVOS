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
import { useCategorias } from '../../inventario/api/catalogos.ts'
import { INFO_TIPO, tiposPermitidos } from '../fases.ts'

import { instante } from '../../../shared/zona.ts'
interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/** Reprograma o corrige lo PREVISTO de una ejecución. Solo mientras está Pendiente. */
export function EditarMantenimientoModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Editar lo previsto de la ejecución #${mantenimiento.id}`}
      size="lg"
    >
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <Formulario onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

function Formulario({ onClose, mantenimiento }: Omit<Props, 'opened'>) {
  const editar = useEditarMantenimiento()
  // Solo los tipos de la clase (hardware/software) de la categoría del activo.
  const categorias = useCategorias()
  const clase = categorias.data?.find((c) => c.id === mantenimiento.activo.categoriaId)?.claseMantenimiento ?? null
  const form = useForm<{ tipo: TipoMantenimiento; actividad: string; fecha: string | null; fechaLimite: string | null; motivoCambio: string }>({
    initialValues: {
      tipo: mantenimiento.tipo,
      actividad: mantenimiento.actividad,
      fecha: isoAFechaHoraLocal(mantenimiento.fecha),
      fechaLimite: mantenimiento.fechaLimite ? isoAFechaHoraLocal(mantenimiento.fechaLimite) : null,
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
      fecha: (v) => (v ? null : 'Indica el inicio previsto'),
      fechaLimite: (v, valores) =>
        !v
          ? 'Indica la fecha límite'
          : valores.fecha && instante(v).isBefore(instante(valores.fecha))
            ? 'La fecha límite no puede ser anterior al inicio previsto'
            : null,
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
          fechaLimite: fechaHoraLocalAIso(v.fechaLimite!),
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
          Solo se puede editar mientras está pendiente. El activo y la planificación no se cambian: si
          hubo un error, anule esta ejecución y cree otra desde la planificación correcta.
        </Text>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Tipo
          </Text>
          <SegmentedControl
            data={tiposPermitidos(clase).map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
            {...form.getInputProps('tipo')}
          />
        </div>
        <Textarea
          label="Descripción prevista"
          withAsterisk
          autosize
          minRows={2}
          {...form.getInputProps('actividad')}
        />
        <Group grow align="flex-start">
          <DateTimePicker
            label="Inicio previsto"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            {...form.getInputProps('fecha')}
          />
          <DateTimePicker
            label="Fecha límite"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            minDate={form.values.fecha ?? undefined}
            {...form.getInputProps('fechaLimite')}
          />
        </Group>
        <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={editar.isPending || editar.isSuccess} disabled={!form.isDirty()}>
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
