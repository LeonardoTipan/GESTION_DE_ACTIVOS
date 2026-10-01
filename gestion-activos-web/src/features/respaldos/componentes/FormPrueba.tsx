import { Button, Group, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { useRegistrarPrueba } from '../api/respaldos.ts'

/** Capa 3 · Restauración/prueba: solo tras una ejecución EXITOSA, una sola vez. */
export function FormPrueba({
  respaldoId,
  fechaEjecucion,
}: {
  respaldoId: number
  /** ISO de la ejecución: la prueba no puede ser anterior. */
  fechaEjecucion: string
}) {
  const registrar = useRegistrarPrueba()
  const form = useForm({
    initialValues: {
      estadoPrueba: 'APROBADA' as 'APROBADA' | 'FALLIDA',
      resultadoPrueba: '',
      fechaPrueba: ahoraLocal() as string | null,
    },
    validate: {
      resultadoPrueba: (v) =>
        !v.trim()
          ? 'Describe el resultado de la prueba'
          : v.trim().length > 191
            ? 'Máximo 191 caracteres'
            : null,
      fechaPrueba: (v) =>
        !v
          ? 'Indica cuándo se probó'
          : dayjs(v).isBefore(dayjs(fechaEjecucion))
            ? 'No puede ser anterior a la ejecución'
            : null,
    },
  })

  const enviar = form.onSubmit((v) =>
    registrar.mutate(
      {
        id: respaldoId,
        datos: {
          estadoPrueba: v.estadoPrueba,
          resultadoPrueba: v.resultadoPrueba.trim(),
          fechaPrueba: fechaHoraLocalAIso(v.fechaPrueba!),
        },
      },
      {
        onSuccess: (r) =>
          notifications.show({
            color: r.estadoPrueba === 'APROBADA' ? 'green' : 'orange',
            title: 'Prueba registrada',
            message:
              r.estadoPrueba === 'APROBADA'
                ? 'Respaldo verificado: ciclo completado.'
                : 'La restauración falló: conviene programar un nuevo respaldo.',
          }),
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo registrar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm" maw={560} mt="xs">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Resultado de la restauración
          </Text>
          <SegmentedControl
            data={[
              { value: 'APROBADA', label: 'Aprobada' },
              { value: 'FALLIDA', label: 'Fallida' },
            ]}
            {...form.getInputProps('estadoPrueba')}
          />
        </div>
        <DateTimePicker
          label="Fecha y hora de la prueba"
          valueFormat="DD MMM YYYY HH:mm"
          minDate={new Date(fechaEjecucion)}
          maxDate={new Date()}
          withAsterisk
          {...form.getInputProps('fechaPrueba')}
        />
        <Textarea
          label="Resultado"
          placeholder="Restauración completa en entorno de pruebas en 42 min; datos íntegros."
          withAsterisk
          autosize
          minRows={2}
          {...form.getInputProps('resultadoPrueba')}
        />
        <Group>
          <Button type="submit" loading={registrar.isPending}>
            Registrar prueba
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
