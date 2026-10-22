import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { CampoExcepcion } from '../../../shared/plazos/componentes.tsx'
import { avisoFueraDePlazo, fmt, errorExcepcion } from '../../../shared/plazos/plazos.ts'
import { useIniciarMantenimiento, type Mantenimiento } from '../api/mantenimientos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/**
 * Capa 2 · Pendiente → En ejecución, con la fecha REAL de mantenimiento. La indica
 * el usuario (puede ser anterior al registro): no se rellena con la hora actual.
 */
export function IniciarModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Iniciar la ejecución" size="lg">
      <FormIniciar onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

/** Sin límite (registros anteriores a los plazos) no hay intervalo que comprobar, igual que en la API. */
function fueraDelPlazo(m: Mantenimiento, real: string | null) {
  return m.fechaLimite ? avisoFueraDePlazo('El inicio real', real, m.fecha, m.fechaLimite) : null
}

function FormIniciar({ onClose, mantenimiento: m }: Omit<Props, 'opened'>) {
  const iniciar = useIniciarMantenimiento()
  const form = useForm({
    initialValues: { fechaInicio: null as string | null, tecnico: m.tecnico ?? '', motivoExcepcion: '' },
    validate: {
      fechaInicio: (v) => (v ? null : 'Indica la fecha real en que empezó el trabajo'),
      tecnico: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      motivoExcepcion: (v, valores) => errorExcepcion(fueraDelPlazo(m, valores.fechaInicio), v),
    },
  })
  const fuera = fueraDelPlazo(m, form.values.fechaInicio)

  const enviar = form.onSubmit((v) =>
    iniciar.mutate(
      {
        id: m.id,
        datos: {
          fechaInicio: fechaHoraLocalAIso(v.fechaInicio!),
          tecnico: v.tecnico.trim() || undefined,
          motivoExcepcion: fuera ? v.motivoExcepcion.trim() : undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'yellow',
            title: 'Ejecución iniciada',
            message: 'Cuando termine, regístrela con "Completar".',
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo iniciar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          La ejecución pasará a <b>En ejecución</b>. Previsto: {fmt(m.fecha)} → {fmt(m.fechaLimite)}. La fecha de
          registro la pone el sistema; aquí se indica cuándo empezó realmente el trabajo.
        </Text>
        <DateTimePicker
          label="Fecha real de mantenimiento"
          description="Cuándo empezó efectivamente (no puede ser futura)"
          placeholder="Elija fecha y hora"
          valueFormat="DD MMM YYYY HH:mm"
          maxDate={ahoraLocal()}
          withAsterisk
          {...form.getInputProps('fechaInicio')}
        />
        <CampoExcepcion
          fuera={fuera}
          value={form.values.motivoExcepcion}
          onChange={(v) => form.setFieldValue('motivoExcepcion', v)}
          error={form.errors.motivoExcepcion as string | undefined}
        />
        <TextInput
          label="Persona encargada"
          placeholder="Usuario o nombre de quien ejecuta"
          description="Se puede indicar también al finalizar; es obligatorio para cerrarlo."
          {...form.getInputProps('tecnico')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="yellow" loading={iniciar.isPending || iniciar.isSuccess}>
            Iniciar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
