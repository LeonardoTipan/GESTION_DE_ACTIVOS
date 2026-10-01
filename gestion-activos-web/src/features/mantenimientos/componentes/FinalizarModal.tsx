import { Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { useFinalizarMantenimiento, type EstadoEquipo } from '../api/mantenimientos.ts'
import { ESTADOS_EQUIPO, INFO_ESTADO_EQUIPO } from '../fases.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimientoId: number
  /** ISO del inicio: el fin no puede ser anterior. */
  fechaInicio: string | null
}

/** EN_EJECUCION → FINALIZADO: resultado y estado en que queda el equipo. */
export function FinalizarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Finalizar mantenimiento" size="lg">
      <FormFinalizar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormFinalizar({ onClose, mantenimientoId, fechaInicio }: Omit<Props, 'opened'>) {
  const finalizar = useFinalizarMantenimiento()
  const form = useForm<{ estadoEquipo: EstadoEquipo; resultado: string; fechaFin: string | null }>(
    {
      initialValues: { estadoEquipo: 'OPERATIVO', resultado: '', fechaFin: ahoraLocal() },
      validate: {
        resultado: (v) =>
          !v.trim()
            ? 'Describe el resultado'
            : v.trim().length > 191
              ? 'Máximo 191 caracteres'
              : null,
        fechaFin: (v) =>
          !v
            ? 'Indica cuándo terminó'
            : fechaInicio && dayjs(v).isBefore(dayjs(fechaInicio))
              ? 'No puede ser anterior al inicio'
              : null,
      },
    },
  )

  const enviar = form.onSubmit((v) =>
    finalizar.mutate(
      {
        id: mantenimientoId,
        datos: {
          estadoEquipo: v.estadoEquipo,
          resultado: v.resultado.trim(),
          fechaFin: fechaHoraLocalAIso(v.fechaFin!),
        },
      },
      {
        onSuccess: (m) => {
          notifications.show({
            color: m.estadoEquipo === 'OPERATIVO' ? 'green' : 'orange',
            title: 'Mantenimiento finalizado',
            message: `El equipo quedó ${INFO_ESTADO_EQUIPO[v.estadoEquipo].etiqueta.toLowerCase()}.`,
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo finalizar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Estado del equipo
          </Text>
          <SegmentedControl
            data={ESTADOS_EQUIPO.map((e) => ({ value: e, label: INFO_ESTADO_EQUIPO[e].etiqueta }))}
            {...form.getInputProps('estadoEquipo')}
          />
        </div>
        <Textarea
          label="Resultado"
          placeholder="Firmware actualizado a v2.4; sin incidencias."
          withAsterisk
          autosize
          minRows={2}
          {...form.getInputProps('resultado')}
        />
        <DateTimePicker
          label="Fecha y hora de fin"
          valueFormat="DD MMM YYYY HH:mm"
          minDate={fechaInicio ? new Date(fechaInicio) : undefined}
          maxDate={new Date()}
          withAsterisk
          {...form.getInputProps('fechaFin')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="green" loading={finalizar.isPending}>
            Finalizar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
