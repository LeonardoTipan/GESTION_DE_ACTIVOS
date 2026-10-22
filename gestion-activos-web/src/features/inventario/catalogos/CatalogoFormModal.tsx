import { Button, Group, Modal, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import type { ConfigCatalogo, ValorCatalogo } from './config-catalogo.ts'

/** Alta (sin fila) o edición (con fila) de un elemento de catálogo. */
export function CatalogoFormModal<
  TFila extends { id: number },
  TDatos extends Record<string, ValorCatalogo>,
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
      config.campos.map((c) =>
        c.tipo === 'interruptor'
          ? [c.clave, fila ? Boolean(fila[c.clave]) : false]
          : c.tipo === 'seleccion'
            ? [c.clave, fila ? ((fila[c.clave] as string | null) ?? null) : null]
            : [c.clave, fila ? String(fila[c.clave] ?? '') : ''],
      ),
    ) as Record<string, ValorCatalogo>

  const form = useForm<Record<string, ValorCatalogo>>({
    initialValues: valores(),
    validate: Object.fromEntries(
      config.campos.filter((c) => c.tipo !== 'interruptor').map((c) => [
        c.clave,
        (valor: ValorCatalogo) =>
          typeof valor !== 'string'
            ? null
            : c.requerido && !valor.trim()
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
      config.campos.map((c) => {
        const valor = v[c.clave]
        if (c.tipo === 'seleccion') return [c.clave, valor || null]
        return [c.clave, typeof valor === 'string' ? valor.trim() : Boolean(valor)]
      }),
    ) as TDatos
    guardar.mutate(
      { id: fila?.id, datos },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: fila ? 'Cambios guardados' : `Nueva ${config.singular} registrada`,
            message: String(Object.values(datos)[0]),
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
            campo.tipo === 'interruptor' ? (
              <Switch
                key={campo.clave}
                label={campo.etiqueta}
                description={campo.descripcion}
                {...form.getInputProps(campo.clave, { type: 'checkbox' })}
              />
            ) : campo.tipo === 'seleccion' ? (
              <Select
                key={campo.clave}
                label={campo.etiqueta}
                description={campo.descripcion}
                placeholder={campo.sinValor}
                data={campo.opciones ?? []}
                clearable
                {...form.getInputProps(campo.clave)}
              />
            ) : campo.multilinea ? (
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
