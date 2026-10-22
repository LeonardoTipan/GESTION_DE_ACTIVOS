import { Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoMotivoCambio } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { instante } from '../../../shared/zona.ts'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import { useCorregirEjecucion, type EstadoEquipo, type Mantenimiento, type TipoMantenimiento } from '../api/mantenimientos.ts'
import { errorRepositorio, ESTADOS_EQUIPO, INFO_ESTADO_EQUIPO, INFO_TIPO, tiposPermitidos } from '../fases.ts'

interface Props {
  opened: boolean
  onClose: () => void
  mantenimiento: Mantenimiento
}

/**
 * Corrige lo EJECUTADO (p. ej. se registró días después o con un dato erróneo):
 * fechas reales, persona encargada, tipo realmente ejecutado y, si está completada,
 * descripción, condición, verificable y repositorio. Exige motivo; queda en la
 * auditoría. En ejecución: admin y analista; completada: solo admin (la API lo valida).
 */
export function CorregirEjecucionModal({ opened, onClose, mantenimiento }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Corregir lo ejecutado · #${mantenimiento.id}`} size="lg">
      <Formulario onClose={onClose} mantenimiento={mantenimiento} />
    </Modal>
  )
}

const maximo = (n: number) => (v: string) => (v.trim().length > n ? `Máximo ${n} caracteres` : null)

function Formulario({ onClose, mantenimiento: m }: Omit<Props, 'opened'>) {
  const corregir = useCorregirEjecucion()
  const completada = m.fase === 'FINALIZADO'
  const categorias = useCategorias()
  const clase = categorias.data?.find((c) => c.id === m.activo.categoriaId)?.claseMantenimiento ?? null
  const inicial = {
    tipo: m.tipo,
    fechaInicio: m.fechaInicio ? isoAFechaHoraLocal(m.fechaInicio) : null,
    fechaFin: m.fechaFin ? isoAFechaHoraLocal(m.fechaFin) : null,
    tecnico: m.tecnico ?? '',
    resultado: m.resultado ?? '',
    estadoEquipo: m.estadoEquipo,
    observaciones: m.observaciones ?? '',
    evidencia: m.evidencia ?? '',
    repositorioVerificable: m.repositorioVerificable ?? '',
    motivoCambio: '',
  }
  const form = useForm<{
    tipo: TipoMantenimiento
    fechaInicio: string | null
    fechaFin: string | null
    tecnico: string
    resultado: string
    estadoEquipo: EstadoEquipo | null
    observaciones: string
    evidencia: string
    repositorioVerificable: string
    motivoCambio: string
  }>({
    initialValues: inicial,
    validate: {
      fechaInicio: (v) => (v ? null : 'La fecha real de mantenimiento es obligatoria'),
      fechaFin: (v, valores) =>
        completada && !v
          ? 'La fecha real de finalización es obligatoria'
          : v && valores.fechaInicio && instante(v).isBefore(instante(valores.fechaInicio))
            ? 'No puede ser anterior a la fecha real de mantenimiento'
            : null,
      tecnico: maximo(191),
      resultado: (v) => (completada && !v.trim() ? 'Obligatoria en una ejecución completada' : maximo(191)(v)),
      observaciones: maximo(2000),
      evidencia: maximo(191),
      repositorioVerificable: errorRepositorio,
      motivoCambio: errorMotivo,
    },
  })

  // Solo se envía lo que cambió (cada cambio queda en la traza con su valor anterior).
  const enviar = form.onSubmit((v) => {
    const texto = (nuevo: string, antes: string) => (nuevo.trim() !== antes ? nuevo.trim() : undefined)
    const fecha = (nuevo: string | null, antes: string | null) => (nuevo && nuevo !== antes ? fechaHoraLocalAIso(nuevo) : undefined)
    const datos = {
      tipo: v.tipo !== inicial.tipo ? v.tipo : undefined,
      fechaInicio: fecha(v.fechaInicio, inicial.fechaInicio),
      tecnico: texto(v.tecnico, inicial.tecnico) || undefined,
      observaciones: texto(v.observaciones, inicial.observaciones),
      evidencia: texto(v.evidencia, inicial.evidencia),
      repositorioVerificable: texto(v.repositorioVerificable, inicial.repositorioVerificable),
      ...(completada
        ? {
            fechaFin: fecha(v.fechaFin, inicial.fechaFin),
            resultado: texto(v.resultado, inicial.resultado),
            estadoEquipo: v.estadoEquipo && v.estadoEquipo !== inicial.estadoEquipo ? v.estadoEquipo : undefined,
          }
        : {}),
    }
    corregir.mutate(
      { id: m.id, datos: { ...datos, motivoCambio: v.motivoCambio.trim() } },
      {
        onSuccess: (r) => {
          notifications.show({ color: 'green', title: 'Ejecución corregida', message: `Versión ${r.version}; el cambio queda en la auditoría.` })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo corregir', message: e.message }),
      },
    )
  })

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Corrige lo realmente ejecutado. Lo planificado no cambia. {completada ? 'Al estar completada, solo un administrador puede hacerlo.' : ''}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <DateTimePicker label="Fecha real de mantenimiento" valueFormat="DD MMM YYYY HH:mm" maxDate={ahoraLocal()} withAsterisk {...form.getInputProps('fechaInicio')} />
          {completada && (
            <DateTimePicker label="Fecha real de finalización" valueFormat="DD MMM YYYY HH:mm" maxDate={ahoraLocal()} withAsterisk {...form.getInputProps('fechaFin')} />
          )}
          <TextInput label="Persona encargada" {...form.getInputProps('tecnico')} />
          <Select
            label="Tipo realmente ejecutado"
            data={tiposPermitidos(clase).map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
            allowDeselect={false}
            {...form.getInputProps('tipo')}
          />
          {completada && (
            <Select
              label="Condición del equipo"
              data={ESTADOS_EQUIPO.map((e) => ({ value: e, label: INFO_ESTADO_EQUIPO[e].etiqueta }))}
              allowDeselect={false}
              {...form.getInputProps('estadoEquipo')}
            />
          )}
          <TextInput label="Verificable" {...form.getInputProps('evidencia')} />
        </SimpleGrid>
        <TextInput label="Repositorio del verificable" placeholder="Carpeta compartida o https://…" {...form.getInputProps('repositorioVerificable')} />
        {completada && <Textarea label="Descripción de la ejecución" autosize minRows={2} {...form.getInputProps('resultado')} />}
        <Textarea label="Observación" autosize minRows={1} {...form.getInputProps('observaciones')} />
        <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={corregir.isPending || corregir.isSuccess} disabled={!form.isDirty()}>
            Guardar corrección
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
