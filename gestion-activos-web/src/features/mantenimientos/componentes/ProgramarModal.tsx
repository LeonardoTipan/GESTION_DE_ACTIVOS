import { Alert, Button, Card, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { fechaHoraLocalAIso } from '../../../shared/formato.ts'
import {
  usePlanesMantenimiento,
  useProgramarMantenimiento,
  type Mantenimiento,
} from '../api/mantenimientos.ts'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import { INFO_FRECUENCIA, INFO_TIPO } from '../fases.ts'
import { BadgeClase } from './Badges.tsx'

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

const folio = (id: number) => `PLM-${String(id).padStart(4, '0')}`

/**
 * Capa 2 · Nueva EJECUCIÓN (situación Pendiente) de una planificación vigente, con su
 * intervalo previsto [inicio, límite]. El activo, el tipo y la descripción prevista
 * salen de la planificación: no se eligen aquí.
 */
export function ProgramarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Nueva ejecución de mantenimiento" size="lg">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <FormProgramar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormProgramar({ onClose, activoInicial, diaInicial, onProgramado }: Omit<Props, 'opened'>) {
  const programar = useProgramarMantenimiento()
  const categorias = useCategorias()
  const [busqueda, setBusqueda] = useState('')
  const [q] = useDebouncedValue(busqueda.trim(), 300)
  const planes = usePlanesMantenimiento({
    estado: 'VIGENTE',
    incluirAnulados: false,
    activoId: activoInicial,
    q: q || undefined,
    page: 1,
    limit: 50,
  })
  const form = useForm<{
    planId: string | null
    fecha: string | null
    fechaLimite: string | null
    justificacion: string
  }>({
    initialValues: {
      planId: null,
      fecha: diaInicial ? `${diaInicial.format('YYYY-MM-DD')} 08:00:00` : null,
      fechaLimite: diaInicial ? `${diaInicial.format('YYYY-MM-DD')} 18:00:00` : null,
      justificacion: '',
    },
    validate: {
      planId: (v) => (v ? null : 'Elige la planificación'),
      fecha: (v) => (v ? null : 'Indica el inicio previsto'),
      fechaLimite: (v, valores) =>
        v && valores.fecha && instante(v).isBefore(instante(valores.fecha))
          ? 'La fecha límite no puede ser anterior al inicio previsto'
          : null,
      // Ya hay una ejecución pendiente del plan: solo una ADICIONAL justificada (regla del backend).
      justificacion: (v, valores) => {
        const elegido = planes.data?.data.find((p) => String(p.id) === valores.planId)
        return elegido?.ejecucionPendienteId != null && v.trim().length < 20 ? 'Justifique la ejecución adicional (mínimo 20 caracteres)' : null
      },
    },
  })
  const plan = planes.data?.data.find((p) => String(p.id) === form.values.planId)
  const conPendiente = plan?.ejecucionPendienteId != null

  const enviar = form.onSubmit((v) =>
    programar.mutate(
      {
        planId: Number(v.planId),
        fecha: fechaHoraLocalAIso(v.fecha!),
        ...(v.fechaLimite ? { fechaLimite: fechaHoraLocalAIso(v.fechaLimite) } : {}),
        ...(conPendiente ? { adicional: true, justificacion: v.justificacion.trim() } : {}),
      },
      {
        onSuccess: (m) => {
          notifications.show({
            color: 'green',
            title: 'Ejecución creada (pendiente)',
            message: `${INFO_TIPO[m.tipo].etiqueta} para ${m.activo.codigo}.`,
          })
          onClose()
          onProgramado(m)
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo crear la ejecución', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <Select
          label="Planificación"
          description="Toda ejecución nace de una planificación vigente: de ella salen el activo, el tipo y la descripción."
          placeholder="Busque por activo, categoría o asignado"
          withAsterisk
          searchable
          searchValue={busqueda}
          onSearchChange={setBusqueda}
          filter={({ options }) => options}
          nothingFoundMessage={planes.isPending ? 'Cargando…' : 'No hay planificaciones vigentes que coincidan'}
          data={(planes.data?.data ?? []).map((p) => ({
            value: String(p.id),
            label: `${folio(p.id)} · ${p.activo.codigo} ${p.activo.nombre} · ${INFO_TIPO[p.tipo].etiqueta} · ${INFO_FRECUENCIA[p.frecuencia]} · ${p.semestrePlanificado.etiqueta}`,
          }))}
          {...form.getInputProps('planId')}
        />
        {plan && (
          <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
            <Group gap="xs">
              <Text size="sm">
                <b>Activo:</b> {plan.activo.codigo} · {plan.activo.nombre} ({plan.activo.categoria})
              </Text>
              <BadgeClase clase={categorias.data?.find((c) => c.id === plan.activo.categoriaId)?.claseMantenimiento ?? null} size="xs" />
            </Group>
            <Text size="sm">
              <b>Asignado:</b> {plan.responsable} · <b>Plazo:</b> {plan.plazoDias} día(s)
            </Text>
            <Text size="sm" c="dimmed" lineClamp={3}>
              {plan.actividades}
            </Text>
          </Card>
        )}
        {conPendiente && (
          <>
            <Alert color="orange" title={`La planificación ya tiene la ejecución #${plan?.ejecucionPendienteId} pendiente`}>
              Solo se admite una ejecución pendiente por planificación. Si hace falta otra a la vez, se registra como
              ejecución ADICIONAL con su justificación (queda en la auditoría). La próxima intervención no cambia.
            </Alert>
            <Textarea label="Justificación de la ejecución adicional" withAsterisk autosize minRows={2} {...form.getInputProps("justificacion")} />
          </>
        )}
        {planes.data && planes.data.meta.total === 0 && !q && (
          <Alert color="yellow">
            No hay planificaciones vigentes{activoInicial ? ' para este activo' : ''}. Créelas en la pestaña Planificación.
          </Alert>
        )}
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
            description={plan ? `Si se omite: inicio + ${plan.plazoDias} día(s)` : 'Si se omite: inicio + plazo de la planificación'}
            valueFormat="DD MMM YYYY HH:mm"
            clearable
            minDate={form.values.fecha ?? undefined}
            {...form.getInputProps('fechaLimite')}
          />
        </Group>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={programar.isPending || programar.isSuccess}>
            Crear ejecución
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
