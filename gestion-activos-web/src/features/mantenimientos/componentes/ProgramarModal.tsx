import { Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import type { Dayjs } from 'dayjs'
import { fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { SeleccionActivos } from '../../inventario/componentes/SeleccionActivos.tsx'
import {
  useProgramarMantenimiento,
  type Mantenimiento,
  type TipoMantenimiento,
} from '../api/mantenimientos.ts'
import { INFO_TIPO, TIPOS } from '../fases.ts'

import { instante } from '../../../shared/zona.ts'
interface Props {
  opened: boolean
  onClose: () => void
  /** Activo preseleccionado (p. ej. si el listado está filtrado por activo). */
  activoInicial?: number
  /** Día elegido en el calendario: inicio previsto ese día a las 08:00 y límite a las 18:00. */
  diaInicial?: Dayjs | null
  onProgramado: (mantenimiento: Mantenimiento) => void
}

/** Capa 1 · Crea un mantenimiento PROGRAMADO con su intervalo previsto [inicio, límite]. */
export function ProgramarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Programar mantenimiento" size="lg">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <FormProgramar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormProgramar({ onClose, activoInicial, diaInicial, onProgramado }: Omit<Props, 'opened'>) {
  const programar = useProgramarMantenimiento()
  const form = useForm<{
    activoId: number | null
    tipo: TipoMantenimiento
    actividad: string
    fecha: string | null
    fechaLimite: string | null
  }>({
    initialValues: {
      activoId: activoInicial ?? null,
      tipo: 'PREVENTIVO',
      actividad: '',
      fecha: diaInicial ? `${diaInicial.format('YYYY-MM-DD')} 08:00:00` : null,
      fechaLimite: diaInicial ? `${diaInicial.format('YYYY-MM-DD')} 18:00:00` : null,
    },
    validate: {
      activoId: (v) => (v ? null : 'Elige el activo'),
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
    programar.mutate(
      {
        activoId: v.activoId!,
        tipo: v.tipo,
        actividad: v.actividad.trim(),
        fecha: fechaHoraLocalAIso(v.fecha!),
        fechaLimite: fechaHoraLocalAIso(v.fechaLimite!),
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
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SeleccionActivos
          titulo="Seleccionar activo para mantenimiento"
          etiqueta="Activo"
          multiple={false}
          value={form.values.activoId ? [form.values.activoId] : []}
          onChange={(ids) => form.setFieldValue('activoId', ids[0] ?? null)}
          error={form.errors.activoId}
          ayuda="Solo se ofrecen activos operativos (también en condición «Malo»)."
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
        <Group grow align="flex-start">
          <DateTimePicker
            label="Inicio previsto"
            description="Desde cuándo puede ejecutarse"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            {...form.getInputProps('fecha')}
          />
          <DateTimePicker
            label="Fecha límite"
            description="Después, queda vencido"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            minDate={form.values.fecha ?? undefined}
            {...form.getInputProps('fechaLimite')}
          />
        </Group>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={programar.isPending || programar.isSuccess}>
            Programar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
