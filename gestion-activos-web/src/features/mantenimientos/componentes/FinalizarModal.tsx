import {
  Button,
  Divider,
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
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoExcepcion } from '../../../shared/plazos/componentes.tsx'
import { avisoFueraDePlazo, errorExcepcion } from '../../../shared/plazos/plazos.ts'
import { useFinalizarMantenimiento, type EstadoEquipo, type Mantenimiento } from '../api/mantenimientos.ts'
import { errorRepositorio, ESTADOS_EQUIPO, INFO_ESTADO_EQUIPO } from '../fases.ts'

import { instante } from '../../../shared/zona.ts'
interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
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
  repositorioVerificable: string
  motivoExcepcion: string
}

const maximo = (n: number) => (v: string) => (v.trim().length > n ? `Máximo ${n} caracteres` : null)

/**
 * Fase de Ejecución · En ejecución → Completado, en UNA sola petición: lo que se
 * hizo y, al final, el cierre (fecha REAL de finalización, verificable, repositorio
 * y observación). Completado es definitivo: no hay fase de verificación posterior.
 */
export function FinalizarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Registrar la ejecución y completarla" size="xl">
      <FormFinalizar onClose={onClose} {...resto} />
    </Modal>
  )
}

/** Si ya se inició fuera de plazo (con su excepción), la API no vuelve a pedirla al finalizar. */
function finFueraDePlazo(m: Mantenimiento, fin: string | null) {
  return m.fechaLimite && !m.fueraDePlazo ? avisoFueraDePlazo('El fin real', fin, null, m.fechaLimite) : null
}

function FormFinalizar({ onClose, mantenimiento: m }: Omit<Props, 'opened'>) {
  const { fechaInicio, tecnico } = m
  const finalizar = useFinalizarMantenimiento()
  const form = useForm<Valores>({
    initialValues: {
      estadoEquipo: 'OPERATIVO',
      resultado: '',
      fechaFin: null,
      tecnico: tecnico ?? '',
      diagnostico: '',
      duracionMin: '',
      costo: '',
      repuestos: '',
      observaciones: '',
      evidencia: '',
      repositorioVerificable: '',
      motivoExcepcion: '',
    },
    validate: {
      resultado: (v) => (!v.trim() ? 'Describa lo ejecutado' : maximo(191)(v)),
      fechaFin: (v) =>
        !v
          ? 'Indique la fecha real en que terminó'
          : fechaInicio && instante(v).isBefore(instante(fechaInicio))
            ? 'No puede ser anterior al inicio'
            : null,
      tecnico: (v) => (!v.trim() ? 'Indique la persona encargada' : maximo(191)(v)),
      diagnostico: (v) => (v.trim().length < 5 ? 'Mínimo 5 caracteres' : maximo(2000)(v)),
      duracionMin: (v) =>
        typeof v !== 'number' || !Number.isInteger(v) || v < 1 ? 'Minutos enteros, al menos 1' : null,
      costo: (v) => (v !== '' && (typeof v !== 'number' || v < 0) ? 'No puede ser negativo' : null),
      repuestos: maximo(2000),
      observaciones: maximo(2000),
      evidencia: maximo(191),
      repositorioVerificable: errorRepositorio,
      motivoExcepcion: (v, valores) => errorExcepcion(finFueraDePlazo(m, valores.fechaFin), v),
    },
  })

  const fuera = finFueraDePlazo(m, form.values.fechaFin)
  const opcional = (v: string) => v.trim() || undefined
  const enviar = form.onSubmit((v) =>
    finalizar.mutate(
      {
        id: m.id,
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
          repositorioVerificable: opcional(v.repositorioVerificable),
          motivoExcepcion: fuera ? v.motivoExcepcion.trim() : undefined,
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: v.estadoEquipo === 'OPERATIVO' ? 'green' : 'orange',
            title: 'Ejecución completada',
            message: `El equipo quedó ${INFO_ESTADO_EQUIPO[v.estadoEquipo].etiqueta.toLowerCase()}. La ejecución queda cerrada.`,
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo completar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {/* Lo que se hizo. */}
        <div>
          <Text size="sm" fw={500} mb={4}>
            Condición en que queda el equipo
          </Text>
          <SegmentedControl
            data={ESTADOS_EQUIPO.map((e) => ({ value: e, label: INFO_ESTADO_EQUIPO[e].etiqueta }))}
            {...form.getInputProps('estadoEquipo')}
          />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="Persona encargada" withAsterisk placeholder="jperez" {...form.getInputProps('tecnico')} />
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
          label="Descripción de la ejecución"
          description="Lo que realmente se hizo (lo planificado está en la planificación)"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Firmware actualizado a v2.4; limpieza interna."
          {...form.getInputProps('resultado')}
        />
        <Textarea
          label="Repuestos utilizados"
          autosize
          minRows={1}
          placeholder="Fuente ATX 500 W"
          {...form.getInputProps('repuestos')}
        />

        {/* Cierre de la ejecución: no hay fase posterior de verificación. */}
        <Divider label="Cierre de la ejecución" labelPosition="left" mt="xs" />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <DateTimePicker
            label="Fecha real de finalización"
            description="Cuándo terminó efectivamente (no puede ser futura)"
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            minDate={fechaInicio ? isoAFechaHoraLocal(fechaInicio) : undefined}
            maxDate={ahoraLocal()}
            withAsterisk
            {...form.getInputProps('fechaFin')}
          />
          <TextInput
            label="Verificable"
            placeholder="Informe MT-2026-031"
            description="Nombre del informe o acta que prueba la ejecución (no se almacenan archivos)."
            {...form.getInputProps('evidencia')}
          />
        </SimpleGrid>
        <CampoExcepcion
          fuera={fuera}
          value={form.values.motivoExcepcion}
          onChange={(v) => form.setFieldValue('motivoExcepcion', v)}
          error={form.errors.motivoExcepcion as string | undefined}
        />
        <TextInput
          label="Repositorio del verificable"
          placeholder="Carpeta Compartida TICs/Interno o https://…"
          description="Carpeta compartida o URL http(s) donde está guardado."
          {...form.getInputProps('repositorioVerificable')}
        />
        <Textarea label="Observación" autosize minRows={1} {...form.getInputProps('observaciones')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" color="green" loading={finalizar.isPending || finalizar.isSuccess}>
            Marcar como completado
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
