import { Alert, Badge, Button, Group, Modal, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { fechaHoraLocalAIso } from '../../shared/formato.ts'
import { periodoDeFecha } from '../../shared/periodo.ts'
import { useActivos } from '../inventario/api/activos.ts'
import { useAbrirPeriodo } from './api.ts'
import { nombrePeriodo } from './textos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  /** Año y mes en curso (hora de la institución): un mes posterior no se puede abrir. */
  hoy: { anio: number; mes: number }
}

/**
 * Nueva planificación: apertura del período mensual. El usuario elige la FECHA planificada en un
 * calendario; mes, año y semestre se derivan de ella. Al abrir se copian los equipos sujetos a
 * control (activos operativos de categorías con Endpoints).
 */
export function PlanificacionPeriodoModal({ opened, onClose, hoy }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Nueva planificación del período" size="lg">
      <Formulario onClose={onClose} hoy={hoy} />
    </Modal>
  )
}

/** Último día del mes en curso («AAAA-MM-DD»): no se planifica un mes futuro. */
const ultimoDiaDelMes = ({ anio, mes }: { anio: number; mes: number }) =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, '0')}`

function Formulario({ onClose, hoy }: Omit<Props, 'opened'>) {
  const abrir = useAbrirPeriodo()
  const equipos = useActivos({ operativos: true, aplica: 'ENDPOINT', page: 1, limit: 1 })
  const form = useForm<{ fechaPlanificada: string | null; responsable: string; observacion: string }>({
    initialValues: { fechaPlanificada: null, responsable: '', observacion: '' },
    validate: {
      fechaPlanificada: (v) => {
        const p = periodoDeFecha(v)
        return !p ? 'Elija la fecha planificada' : p.anio * 12 + p.mes > hoy.anio * 12 + hoy.mes ? 'No se puede planificar un mes futuro' : null
      },
      responsable: (v) => (!v.trim() ? 'Obligatorio' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      observacion: (v) => (v.trim().length > 2000 ? 'Máximo 2000 caracteres' : null),
    },
  })
  const periodo = periodoDeFecha(form.values.fechaPlanificada)

  const enviar = form.onSubmit((v) =>
    abrir.mutate(
      // Mediodía local: el día elegido no cambia por la conversión a UTC.
      { fechaPlanificada: fechaHoraLocalAIso(`${v.fechaPlanificada} 12:00:00`), responsable: v.responsable.trim(), observacion: v.observacion.trim() || undefined },
      {
        onSuccess: (p) => {
          notifications.show({ color: 'green', title: 'Período abierto', message: `${nombrePeriodo(p.anio, p.mes)} · ${p.equiposSinRegistrar ?? 0} equipo(s) sujetos a control. Queda en la auditoría.` })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo abrir el período', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <DatePickerInput
            label="Fecha planificada"
            description="Del mes en curso o de uno anterior; un solo período por mes"
            placeholder="Elija la fecha"
            valueFormat="DD MMM YYYY"
            withAsterisk
            maxDate={ultimoDiaDelMes(hoy)}
            {...form.getInputProps('fechaPlanificada')}
          />
          <TextInput label="Responsable asignado" description="Quién se encarga de la medición del mes" withAsterisk placeholder="Soporte TIC" {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Group gap="xs" aria-label="Período calculado">
          <Text size="sm" c="dimmed">
            Período calculado:
          </Text>
          {periodo ? (
            <>
              <Badge variant="light">Mes: {periodo.nombreMes}</Badge>
              <Badge variant="light">Año: {periodo.anio}</Badge>
              <Badge variant="light">Semestre: {periodo.semestre}</Badge>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          )}
        </Group>
        <Textarea label="Observaciones" autosize minRows={2} placeholder="Corte con el inventario de GLPI del último día hábil." {...form.getInputProps('observacion')} />
        <Alert color="blue" variant="light">
          {equipos.data
            ? `Al abrir se incluirán los ${equipos.data.meta.total} equipo(s) sujetos a control: activos operativos de categorías habilitadas para Protección de endpoints. Cada uno se registra después, en Ejecución y cierre.`
            : 'Cargando los equipos sujetos a control…'}
        </Alert>
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
