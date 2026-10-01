import { Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { useRegistrarEjecucion } from '../api/respaldos.ts'

/** Capa 2 · Ejecución: se registra una sola vez. */
export function FormEjecucion({ respaldoId }: { respaldoId: number }) {
  const registrar = useRegistrarEjecucion()
  const form = useForm({
    initialValues: {
      estadoEjecucion: 'EXITOSA' as 'EXITOSA' | 'FALLIDA',
      fechaEjecucion: ahoraLocal() as string | null,
      rutaEvidencia: '',
    },
    validate: {
      fechaEjecucion: (v) => (v ? null : 'Indica cuándo se ejecutó'),
      rutaEvidencia: (v) =>
        !v.trim()
          ? 'Indica dónde está la evidencia'
          : v.trim().length > 191
            ? 'Máximo 191 caracteres'
            : null,
    },
  })

  const enviar = form.onSubmit((v) =>
    registrar.mutate(
      {
        id: respaldoId,
        datos: {
          estadoEjecucion: v.estadoEjecucion,
          fechaEjecucion: fechaHoraLocalAIso(v.fechaEjecucion!),
          rutaEvidencia: v.rutaEvidencia.trim(),
        },
      },
      {
        onSuccess: (r) =>
          notifications.show({
            color: r.estadoEjecucion === 'EXITOSA' ? 'green' : 'orange',
            title: 'Ejecución registrada',
            message:
              r.estadoEjecucion === 'EXITOSA'
                ? 'Siguiente paso: la prueba de restauración.'
                : 'La ejecución falló: este respaldo no admite prueba.',
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
            Resultado de la ejecución
          </Text>
          <SegmentedControl
            data={[
              { value: 'EXITOSA', label: 'Exitosa' },
              { value: 'FALLIDA', label: 'Fallida' },
            ]}
            {...form.getInputProps('estadoEjecucion')}
          />
        </div>
        <DateTimePicker
          label="Fecha y hora de ejecución"
          valueFormat="DD MMM YYYY HH:mm"
          maxDate={new Date()}
          withAsterisk
          {...form.getInputProps('fechaEjecucion')}
        />
        <TextInput
          label="Evidencia"
          description="URL o ruta de red del log, captura o informe"
          placeholder="\\nas01\respaldos\erp\2026-10-01.log"
          withAsterisk
          {...form.getInputProps('rutaEvidencia')}
        />
        <Group>
          <Button type="submit" loading={registrar.isPending}>
            Registrar ejecución
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
