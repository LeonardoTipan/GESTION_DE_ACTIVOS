import { Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import type { ConfigCatalogo } from './config-catalogo.ts'

/** Alta (sin fila) o edición (con fila) de un elemento de catálogo. */
export function CatalogoFormModal<
  TFila extends { id: number },
  TDatos extends Record<string, string>,
>({
  config,
  fila,
  opened,
  onClose,
}: {
  config: ConfigCatalogo<TFila, TDatos>
  fila?: TFila
  opened: boolean
  onClose: () => void
}) {
  const guardar = config.useGuardar()

  const valores = () =>
    Object.fromEntries(
      config.campos.map((c) => [c.clave, fila ? String(fila[c.clave] ?? '') : '']),
    ) as Record<string, string>

  const form = useForm<Record<string, string>>({
    initialValues: valores(),
    validate: Object.fromEntries(
      config.campos.map((c) => [
        c.clave,
        (valor: string) =>
          c.requerido && !valor.trim()
            ? 'Campo obligatorio'
            : valor.trim().length > 191
              ? 'Máximo 191 caracteres'
              : null,
      ]),
    ),
  })

  useEffect(() => {
    if (opened) {
      form.setValues(valores())
      form.clearErrors()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [opened, fila])

  const enviar = form.onSubmit((v) => {
    const datos = Object.fromEntries(
      config.campos.map((c) => [c.clave, (v[c.clave] ?? '').trim()]),
    ) as TDatos
    guardar.mutate(
      { id: fila?.id, datos },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: fila ? 'Cambios guardados' : `Nueva ${config.singular} registrada`,
            message: Object.values(datos)[0],
          })
          onClose()
        },
        onError: (error) =>
          notifications.show({ color: 'red', title: 'No se pudo guardar', message: error.message }),
      },
    )
  })

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={fila ? `Editar ${config.singular}` : `Nueva ${config.singular}`}
    >
      <form onSubmit={enviar}>
        <Stack gap="sm">
          {config.campos.map((campo) =>
            campo.multilinea ? (
              <Textarea
                key={campo.clave}
                label={campo.etiqueta}
                withAsterisk={campo.requerido}
                autosize
                minRows={2}
                {...form.getInputProps(campo.clave)}
              />
            ) : (
              <TextInput
                key={campo.clave}
                label={campo.etiqueta}
                withAsterisk={campo.requerido}
                {...form.getInputProps(campo.clave)}
              />
            ),
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardar.isPending}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
