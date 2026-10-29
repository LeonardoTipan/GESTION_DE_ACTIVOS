import { Alert, Button, Group, Modal, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { fechaHoraLocalAIso, formatearFechaHora } from '../../shared/formato.ts'
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
      fechaProgramadaProduccion: (v) => (v ? null : 'Indique la fecha programada de paso a producción'),
      responsable: (v) => (!v.trim() ? 'Obligatorio' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      descripcion: (v) => (v.trim().length < 10 ? 'Mínimo 10 caracteres' : v.trim().length > 2000 ? 'Máximo 2000 caracteres' : null),
    },
  })

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
            message: `${e.activo.codigo} · paso a producción ${formatearFechaHora(e.fechaProgramadaProduccion)}.`,
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
            label="Fecha programada de paso a producción"
            description="Cuándo está previsto que el sistema pase a producción. No es la fecha de solicitud."
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            {...form.getInputProps('fechaProgramadaProduccion')}
          />
          <TextInput label="Asignado" description="Quién realiza la evaluación de seguridad" withAsterisk placeholder="Seguridad TIC" {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Textarea
          label="Descripción planificada"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Versión 2.1 del sistema de nómina: pruebas de autenticación, autorización e inyección."
          {...form.getInputProps('descripcion')}
        />
        <Alert color="blue" variant="light">
          Fase 1: se planifica la evaluación. La fecha real de las pruebas de seguridad y el informe verificable se
          registrarán en la fase 2 (aún no disponible).
        </Alert>
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
