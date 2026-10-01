import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import { SelectorActivo } from '../../inventario/componentes/SelectorActivo.tsx'
import { useCrearRespaldo, type Respaldo } from '../api/respaldos.ts'

/** Capa 1 · Alcance: qué se respalda y de qué activo. */
export function NuevoRespaldoModal({
  opened,
  onClose,
  activoInicial,
  onCreado,
}: {
  opened: boolean
  onClose: () => void
  /** Activo preseleccionado (p. ej. si el listado está filtrado por activo). */
  activoInicial?: number
  onCreado: (respaldo: Respaldo) => void
}) {
  const crear = useCrearRespaldo()
  const form = useForm<{ activoId: number | null; alcanceDetalle: string }>({
    initialValues: { activoId: activoInicial ?? null, alcanceDetalle: '' },
    validate: {
      activoId: (v) => (v ? null : 'Elige el activo a respaldar'),
      alcanceDetalle: (v) =>
        !v.trim() ? 'Describe el alcance' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null,
    },
  })

  useEffect(() => {
    if (opened) {
      form.setValues({ activoId: activoInicial ?? null, alcanceDetalle: '' })
      form.clearErrors()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [opened])

  const enviar = form.onSubmit((v) =>
    crear.mutate(
      { activoId: v.activoId!, alcanceDetalle: v.alcanceDetalle.trim() },
      {
        onSuccess: (respaldo) => {
          notifications.show({
            color: 'green',
            title: 'Respaldo registrado',
            message: `Alcance definido para ${respaldo.activo.codigo}. Siguiente paso: registrar la ejecución.`,
          })
          onClose()
          onCreado(respaldo)
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo registrar', message: e.message }),
      },
    ),
  )

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo respaldo · Capa 1: alcance" size="lg">
      <form onSubmit={enviar}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Define qué se va a respaldar. La ejecución y la prueba de restauración se registran
            después, desde la ficha del respaldo.
          </Text>
          <SelectorActivo
            label="Activo"
            placeholder="Busca por código o nombre"
            withAsterisk
            value={form.values.activoId}
            onChange={(id) => form.setFieldValue('activoId', id)}
            error={form.errors.activoId}
          />
          <Textarea
            label="Alcance"
            description="Qué datos o componentes incluye el respaldo"
            placeholder="Base de datos ERP completa + archivos de configuración"
            withAsterisk
            autosize
            minRows={3}
            {...form.getInputProps('alcanceDetalle')}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={crear.isPending}>
              Registrar alcance
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
