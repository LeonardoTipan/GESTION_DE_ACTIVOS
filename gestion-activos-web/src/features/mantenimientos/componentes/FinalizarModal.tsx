import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
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
  /** Técnico indicado al iniciar, si lo hubo. */
  tecnico: string | null
}

interface Valores {
  estadoEquipo: EstadoEquipo
  resultado: string
  fechaFin: string | null
  tecnico: string
  diagnostico: string
  duracionMin: number | string
  costo: number | string
  repuestos: string
  observaciones: string
  evidencia: string
}

const maximo = (n: number) => (v: string) => (v.trim().length > n ? `Máximo ${n} caracteres` : null)

/**
 * Capa 2 · EN_EJECUCION → FINALIZADO: lo que se hizo, quién, cuánto tardó y
 * costó. El técnico, el diagnóstico y la duración son obligatorios.
 */
export function FinalizarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Registrar la ejecución y finalizar" size="xl">
      <FormFinalizar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormFinalizar({ onClose, mantenimientoId, fechaInicio, tecnico }: Omit<Props, 'opened'>) {
  const finalizar = useFinalizarMantenimiento()
  const form = useForm<Valores>({
    initialValues: {
      estadoEquipo: 'OPERATIVO',
      resultado: '',
      fechaFin: ahoraLocal(),
      tecnico: tecnico ?? '',
      diagnostico: '',
      duracionMin: '',
      costo: '',
      repuestos: '',
      observaciones: '',
      evidencia: '',
    },
    validate: {
      resultado: (v) => (!v.trim() ? 'Describe las actividades realizadas' : maximo(191)(v)),
      fechaFin: (v) =>
        !v
          ? 'Indica cuándo terminó'
          : fechaInicio && dayjs(v).isBefore(dayjs(fechaInicio))
            ? 'No puede ser anterior al inicio'
            : null,
      tecnico: (v) => (!v.trim() ? 'Indica el técnico responsable' : maximo(191)(v)),
      diagnostico: (v) => (v.trim().length < 5 ? 'Mínimo 5 caracteres' : maximo(2000)(v)),
      duracionMin: (v) =>
        typeof v !== 'number' || !Number.isInteger(v) || v < 1 ? 'Minutos enteros, al menos 1' : null,
      costo: (v) => (v !== '' && (typeof v !== 'number' || v < 0) ? 'No puede ser negativo' : null),
      repuestos: maximo(2000),
      observaciones: maximo(2000),
      evidencia: maximo(191),
    },
  })

  const opcional = (v: string) => v.trim() || undefined
  const enviar = form.onSubmit((v) =>
    finalizar.mutate(
      {
        id: mantenimientoId,
        datos: {
          estadoEquipo: v.estadoEquipo,
          resultado: v.resultado.trim(),
          fechaFin: fechaHoraLocalAIso(v.fechaFin!),
          tecnico: v.tecnico.trim(),
          diagnostico: v.diagnostico.trim(),
          duracionMin: Number(v.duracionMin),
          costo: v.costo === '' ? undefined : Number(v.costo),
          repuestos: opcional(v.repuestos),
          observaciones: opcional(v.observaciones),
          evidencia: opcional(v.evidencia),
        },
      },
      {
        onSuccess: (m) => {
          notifications.show({
            color: m.estadoEquipo === 'OPERATIVO' ? 'green' : 'orange',
            title: 'Mantenimiento finalizado',
            message: `El equipo quedó ${INFO_ESTADO_EQUIPO[v.estadoEquipo].etiqueta.toLowerCase()}. Falta la verificación para cerrarlo.`,
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo finalizar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Estado en que queda el equipo
          </Text>
          <SegmentedControl
            data={ESTADOS_EQUIPO.map((e) => ({ value: e, label: INFO_ESTADO_EQUIPO[e].etiqueta }))}
            {...form.getInputProps('estadoEquipo')}
          />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Técnico" withAsterisk placeholder="jperez" {...form.getInputProps('tecnico')} />
          <DateTimePicker
            label="Fecha y hora de fin"
            valueFormat="DD MMM YYYY HH:mm"
            minDate={fechaInicio ? new Date(fechaInicio) : undefined}
            maxDate={new Date()}
            withAsterisk
            {...form.getInputProps('fechaFin')}
          />
          <NumberInput
            label="Duración (minutos)"
            withAsterisk
            min={1}
            allowDecimal={false}
            {...form.getInputProps('duracionMin')}
          />
          <NumberInput
            label="Costo (USD)"
            description="Opcional"
            min={0}
            decimalScale={2}
            prefix="$ "
            {...form.getInputProps('costo')}
          />
        </SimpleGrid>
        <Textarea
          label="Diagnóstico"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Qué falla o necesidad se encontró."
          {...form.getInputProps('diagnostico')}
        />
        <Textarea
          label="Actividades realizadas"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Firmware actualizado a v2.4; limpieza interna."
          {...form.getInputProps('resultado')}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Textarea
            label="Repuestos utilizados"
            autosize
            minRows={1}
            placeholder="Fuente ATX 500 W"
            {...form.getInputProps('repuestos')}
          />
          <TextInput
            label="Evidencia"
            placeholder="Acta, orden de trabajo o informe (referencia)"
            description="Referencia documental: la aplicación no almacena archivos."
            {...form.getInputProps('evidencia')}
          />
        </SimpleGrid>
        <Textarea label="Observaciones" autosize minRows={1} {...form.getInputProps('observaciones')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="green" loading={finalizar.isPending || finalizar.isSuccess}>
            Finalizar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
