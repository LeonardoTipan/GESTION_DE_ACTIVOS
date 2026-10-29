import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useAbrirPeriodo } from './api.ts'
import { MESES, nombrePeriodo } from './textos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  /** Año y mes en curso (hora de la institución): no se abren meses futuros. */
  hoy: { anio: number; mes: number }
}

/**
 * Nueva planificación · fase 1: apertura del período mensual. Solo los datos de la apertura;
 * los de la fase 2 (totales, equipos con antivirus, Excel del inventario) llegarán después.
 * Mismo lenguaje visual que «Nueva planificación de mantenimiento».
 */
export function PlanificacionPeriodoModal({ opened, onClose, hoy }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} size="xl" title="Nueva planificación · período mensual">
      {/* El formulario vive dentro del modal: se monta de nuevo (vacío) en cada apertura. */}
      <Formulario onClose={onClose} hoy={hoy} />
    </Modal>
  )
}

const ANIOS = (hasta: number) => Array.from({ length: 6 }, (_, i) => String(hasta - i))

function Formulario({ onClose, hoy }: Omit<Props, 'opened'>) {
  const abrir = useAbrirPeriodo()
  const form = useForm<{ anio: string | null; mes: string | null; responsable: string; observacion: string }>({
    initialValues: { anio: String(hoy.anio), mes: null, responsable: '', observacion: '' },
    validate: {
      anio: (v) => (v ? null : 'Elija el año'),
      mes: (v, x) =>
        !v ? 'Elija el mes' : Number(x.anio) * 12 + Number(v) > hoy.anio * 12 + hoy.mes ? 'No se puede abrir un mes futuro' : null,
      responsable: (v) => (!v.trim() ? 'Obligatorio' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      observacion: (v) => (v.trim().length > 2000 ? 'Máximo 2000 caracteres' : null),
    },
  })
  const anio = Number(form.values.anio)
  const meses = MESES.map((m, i) => ({ value: String(i + 1), label: m, disabled: anio * 12 + i + 1 > hoy.anio * 12 + hoy.mes }))

  const enviar = form.onSubmit((v) =>
    abrir.mutate(
      { anio: Number(v.anio), mes: Number(v.mes), responsable: v.responsable.trim(), observacion: v.observacion.trim() || undefined },
      {
        onSuccess: (p) => {
          notifications.show({ color: 'green', title: 'Período abierto', message: `${nombrePeriodo(p.anio, p.mes)} · queda en la auditoría.` })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo abrir el período', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Alert color="blue" variant="light">
          Fase 1: se abre el período del mes. El total de activos, los equipos con antivirus y el Excel del inventario se
          registrarán en la fase 2 (aún no disponible).
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Año"
            withAsterisk
            data={ANIOS(hoy.anio)}
            allowDeselect={false}
            {...form.getInputProps('anio')}
            onChange={(v) => {
              form.setFieldValue('anio', v)
              form.setFieldValue('mes', null)
            }}
          />
          <Select
            label="Mes"
            withAsterisk
            placeholder="Elija el mes"
            description="El mes en curso o uno anterior; un solo período por mes"
            data={meses}
            {...form.getInputProps('mes')}
          />
          <TextInput label="Asignado" description="Quién se encarga de la medición del mes" withAsterisk placeholder="Soporte TIC" {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Textarea
          label="Observación"
          autosize
          minRows={2}
          placeholder="Corte con el inventario de GLPI del último día hábil."
          {...form.getInputProps('observacion')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={abrir.isPending || abrir.isSuccess}>
            Abrir período
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
