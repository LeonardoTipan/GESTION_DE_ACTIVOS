import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Switch, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { isoADia } from '../../shared/formato.ts'
import { CampoMotivoCambio } from '../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../shared/registro/registro.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import { BadgeClase } from '../inventario/componentes/BadgeClase.tsx'
import { SeleccionActivos } from '../inventario/componentes/SeleccionActivos.tsx'
import { useEditarPlanificacion, usePlanificar, useRenovaciones, type Renovacion, type TipoRenovacion } from './api.ts'
import { INFO_TIPO, TIPOS } from './textos.ts'

interface Props {
  opened: boolean
  onClose: () => void
  /** Sin renovación: planificar una nueva. Con ella: corregir su planificación (con motivo). */
  renovacion?: Renovacion
  onGuardada?: (r: Renovacion) => void
}

/** Fase 1 · Planificación: crear o corregir (con motivo). */
export function PlanificacionModal({ opened, onClose, renovacion, onGuardada }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} size="xl" title={renovacion ? `Corregir la planificación · #${renovacion.id}` : 'Planificación · nueva renovación'}>
      <Formulario onClose={onClose} renovacion={renovacion} onGuardada={onGuardada} />
    </Modal>
  )
}

interface Valores {
  activoId: number | null
  tipo: TipoRenovacion | null
  responsable: string
  fechaPlanificada: string | null
  fechaCaducidadActual: string | null
  sinCaducidadActual: boolean
  observacion: string
  motivoCambio: string
}

function Formulario({ onClose, renovacion: r, onGuardada }: Omit<Props, 'opened'>) {
  const planificar = usePlanificar()
  const editar = useEditarPlanificacion()
  const categorias = useCategorias()
  const claseDe = (categoriaId: number) => categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null
  const editable = !r || r.estado === 'ABIERTO'
  const inicial: Valores = {
    activoId: r?.activoId ?? null,
    tipo: r?.tipo ?? null,
    responsable: r?.responsable ?? '',
    fechaPlanificada: r ? isoADia(r.fechaPlanificada) : null,
    fechaCaducidadActual: r?.fechaCaducidadActual ? isoADia(r.fechaCaducidadActual) : null,
    sinCaducidadActual: r?.sinCaducidadActual ?? false,
    observacion: r?.observacion ?? '',
    motivoCambio: '',
  }
  const form = useForm<Valores>({
    initialValues: inicial,
    validate: {
      activoId: (v) => (v ? null : 'Elija el sistema'),
      tipo: (v) => (v ? null : 'Elija el tipo de renovación'),
      responsable: (v) => (!v.trim() ? 'Indique el responsable' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      fechaPlanificada: (v) => (v ? null : 'Indique el día previsto'),
      fechaCaducidadActual: (v, x) => (!v && !x.sinCaducidadActual ? 'Indique hasta cuándo vale hoy, o marque «sin caducidad»' : null),
      observacion: (v, x) => (x.sinCaducidadActual && !v.trim() ? 'Justifique por qué no tiene caducidad' : v.length > 5000 ? 'Máximo 5000 caracteres' : null),
      motivoCambio: (v) => (r ? errorMotivo(v) : null),
    },
  })

  // Si el elemento ya se renovó, su caducidad vigente es la nueva de esa renovación:
  // se sugiere (el usuario la confirma o la corrige; no se completa a escondidas).
  const [sugerida, setSugerida] = useState<string | null>(null)
  const previa = useRenovaciones({
    page: 1,
    limit: 1,
    activoId: form.values.activoId ?? undefined,
    tipo: form.values.tipo ?? undefined,
    estado: 'CERRADO',
    vigencia: undefined,
  })
  const anterior = !r && form.values.activoId && form.values.tipo ? previa.data?.data.find((x) => !x.sustituidaPor) : undefined
  const fechaAnterior = anterior?.nuevaFechaCaducidad ? isoADia(anterior.nuevaFechaCaducidad) : null

  const enviar = form.onSubmit((v) => {
    const comun = {
      responsable: v.responsable.trim(),
      fechaPlanificada: v.fechaPlanificada!,
      fechaCaducidadActual: v.sinCaducidadActual ? undefined : (v.fechaCaducidadActual ?? undefined),
      sinCaducidadActual: v.sinCaducidadActual,
      observacion: v.observacion.trim() || undefined,
    }
    const listo = (x: Renovacion) => {
      notifications.show({ color: 'green', title: r ? 'Planificación corregida' : 'Renovación planificada', message: r ? 'El cambio queda en la auditoría.' : 'Estado: Abierto.' })
      onClose()
      onGuardada?.(x)
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    if (r) {
      const cambio = <T,>(a: T, b: T) => (a !== b ? a : undefined)
      editar.mutate(
        {
          id: r.id,
          datos: {
            activoId: cambio(v.activoId!, inicial.activoId!),
            tipo: cambio(v.tipo!, inicial.tipo!),
            responsable: cambio(comun.responsable, inicial.responsable),
            fechaPlanificada: cambio(comun.fechaPlanificada, inicial.fechaPlanificada!),
            fechaCaducidadActual: cambio(v.fechaCaducidadActual, inicial.fechaCaducidadActual) ?? undefined,
            sinCaducidadActual: cambio(v.sinCaducidadActual, inicial.sinCaducidadActual),
            observacion: cambio(v.observacion.trim(), inicial.observacion) || undefined,
            motivoCambio: v.motivoCambio.trim(),
          },
        },
        { onSuccess: listo, onError: error },
      )
    } else {
      planificar.mutate({ ...comun, activoId: v.activoId!, tipo: v.tipo! }, { onSuccess: listo, onError: error })
    }
  })

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {editable ? (
          <SeleccionActivos
            titulo="Sistema"
            etiqueta="Sistema (activo de GLPI)"
            multiple={false}
            value={form.values.activoId ? [form.values.activoId] : []}
            onChange={(ids) => form.setFieldValue('activoId', ids[0] ?? null)}
            insignia={(a) => <BadgeClase clase={claseDe(a.categoriaId)} size="xs" />}
            error={form.errors.activoId}
            ayuda="Solo se ofrecen activos operativos. La renovación no modifica el activo."
          />
        ) : (
          <TextInput label="Sistema" value={`${r!.activo.codigo} · ${r!.activo.nombre}`} disabled description="El sistema y el tipo solo se cambian mientras está abierta." />
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Tipo de renovación"
            withAsterisk
            disabled={!editable}
            data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t] }))}
            allowDeselect={false}
            {...form.getInputProps('tipo')}
          />
          <TextInput label="Responsable" description="Persona encargada de gestionarla" placeholder="ANALISTA 1" withAsterisk {...form.getInputProps('responsable')} />
          <DatePickerInput label="Fecha planificada" description="Día previsto para renovar" placeholder="Elija el día" valueFormat="DD MMM YYYY" withAsterisk {...form.getInputProps('fechaPlanificada')} />
          <DatePickerInput
            label="Fecha de caducidad actual"
            description="Hasta cuándo vale hoy lo que se renueva"
            placeholder="Elija el día"
            valueFormat="DD MMM YYYY"
            clearable
            disabled={form.values.sinCaducidadActual}
            withAsterisk={!form.values.sinCaducidadActual}
            {...form.getInputProps('fechaCaducidadActual')}
          />
        </SimpleGrid>
        {fechaAnterior && form.values.fechaCaducidadActual !== fechaAnterior && sugerida !== fechaAnterior && (
          <Alert color="blue" variant="light">
            Este elemento ya se renovó (#{anterior!.id}) con vigencia hasta el {fechaAnterior}.{' '}
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                form.setFieldValue('fechaCaducidadActual', fechaAnterior)
                setSugerida(fechaAnterior)
              }}
            >
              Usar esa fecha
            </Button>
          </Alert>
        )}
        <Switch
          label="Sin caducidad conocida o aplicable"
          description="Por ejemplo, una licencia perpetua. Exige justificarlo en la observación."
          {...form.getInputProps('sinCaducidadActual', { type: 'checkbox' })}
          onChange={(e) => {
            form.setFieldValue('sinCaducidadActual', e.currentTarget.checked)
            if (e.currentTarget.checked) form.setFieldValue('fechaCaducidadActual', null)
          }}
        />
        <Textarea
          label="Observación"
          description={form.values.sinCaducidadActual ? 'Obligatoria: por qué no tiene caducidad' : 'Opcional'}
          withAsterisk={form.values.sinCaducidadActual}
          autosize
          minRows={2}
          {...form.getInputProps('observacion')}
        />
        {r && <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={planificar.isPending || editar.isPending} disabled={!!r && !form.isDirty()}>
            {r ? 'Guardar cambios' : 'Planificar (estado Abierto)'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
