import { Badge, Button, Group, Modal, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { fechaHoraLocalAIso, formatearFechaHora } from '../../shared/formato.ts'
import { periodoDeFecha } from '../../shared/periodo.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { SeleccionActivos } from '../inventario/componentes/SeleccionActivos.tsx'
import { usePlanificarEvaluacion } from './api.ts'

interface Valores {
  activoIds: number[]
  fechaProgramadaProduccion: string | null
  responsable: string
  descripcion: string
}

/**
 * Nueva planificación · fase 1 de Evaluación de Sistemas Productivos, con el mismo lenguaje
 * visual que «Nueva planificación de mantenimiento»: selector de activos (solo los de
 * categorías con «Evaluación»), campos en dos columnas y la descripción planificada.
 */
export function PlanificacionEvaluacionModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} size="xl" title="Nueva planificación de evaluación">
      {/* El formulario vive dentro del modal: se monta de nuevo (vacío) en cada apertura. */}
      <Formulario onClose={onClose} />
    </Modal>
  )
}

function Formulario({ onClose }: { onClose: () => void }) {
  const planificar = usePlanificarEvaluacion()
  const categorias = useCategorias()
  const claseDe = (categoriaId: number) => categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null
  const form = useForm<Valores>({
    initialValues: { activoIds: [], fechaProgramadaProduccion: null, responsable: '', descripcion: '' },
    validate: {
      activoIds: (v) => (v.length === 1 ? null : 'Elija el sistema que pasa a producción'),
      fechaProgramadaProduccion: (v) => (v ? null : 'Indique la fecha planificada de evaluación'),
      responsable: (v) => (!v.trim() ? 'Obligatorio' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      descripcion: (v) => (v.trim().length < 10 ? 'Mínimo 10 caracteres' : v.trim().length > 2000 ? 'Máximo 2000 caracteres' : null),
    },
  })

  const periodo = periodoDeFecha(form.values.fechaProgramadaProduccion)
  const enviar = form.onSubmit((v) =>
    planificar.mutate(
      {
        activoId: v.activoIds[0],
        fechaProgramadaProduccion: fechaHoraLocalAIso(v.fechaProgramadaProduccion!),
        responsable: v.responsable.trim(),
        descripcion: v.descripcion.trim(),
      },
      {
        onSuccess: (e) => {
          notifications.show({
            color: 'green',
            title: 'Evaluación planificada',
            message: `${e.activo.codigo} · evaluación planificada para ${formatearFechaHora(e.fechaProgramadaProduccion)}.`,
          })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo planificar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SeleccionActivos
          aplica="EVALUACION"
          titulo="Seleccionar el sistema"
          etiqueta="Sistema (activo de software)"
          multiple={false}
          value={form.values.activoIds}
          onChange={(ids) => form.setFieldValue('activoIds', ids)}
          insignia={(a) => <BadgeClase clase={claseDe(a.categoriaId)} size="xs" />}
          error={form.errors.activoIds}
          ayuda="Solo se ofrecen activos operativos de categorías habilitadas para Evaluación (Catálogos > Categorías)."
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <DateTimePicker
            label="Fecha planificada de evaluación"
            description="La del paso a producción previsto (puede ser futura). No es la fecha de registro."
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            {...form.getInputProps('fechaProgramadaProduccion')}
          />
          <TextInput label="Responsable asignado" description="Quién realiza la evaluación de seguridad" withAsterisk placeholder="Seguridad TIC" {...form.getInputProps('responsable')} />
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
        <Textarea
          label="Descripción"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Versión 2.1 del sistema de nómina: pruebas de autenticación, autorización e inyección."
          {...form.getInputProps('descripcion')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={planificar.isPending || planificar.isSuccess}>
            Planificar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
