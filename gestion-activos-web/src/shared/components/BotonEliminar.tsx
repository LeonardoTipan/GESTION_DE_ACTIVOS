import { Button, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconTrash } from '@tabler/icons-react'
import type { ReactNode } from 'react'

/**
 * Botón "Eliminar" con confirmación obligatoria, y mensajes de éxito y de
 * error. Cada módulo decide quién lo ve (solo el administrador) y qué hacer
 * después (normalmente volver al listado, que se refresca solo).
 */
export function BotonEliminar({
  titulo,
  children,
  eliminar,
  eliminando,
  mensajeExito,
  alEliminar,
}: {
  /** Título de la confirmación: "Eliminar el respaldo #12". */
  titulo: string
  /** Explicación de las consecuencias, dentro de la confirmación. */
  children: ReactNode
  /** Lanza el borrado; recibe qué hacer si sale bien o mal. */
  eliminar: (opciones: { onSuccess: () => void; onError: (error: Error) => void }) => void
  eliminando: boolean
  mensajeExito: string
  alEliminar: () => void
}) {
  const confirmar = () =>
    modals.openConfirmModal({
      title: titulo,
      children: (
        <Text size="sm" component="div">
          {children}
        </Text>
      ),
      labels: { confirm: 'Eliminar definitivamente', cancel: 'Volver' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        eliminar({
          onSuccess: () => {
            notifications.show({ color: 'green', title: 'Eliminado', message: mensajeExito })
            alEliminar()
          },
          onError: (error) =>
            notifications.show({
              color: 'red',
              title: 'No se pudo eliminar',
              message: error.message,
            }),
        }),
    })

  return (
    <Button
      variant="light"
      color="red"
      leftSection={<IconTrash size={16} />}
      onClick={confirmar}
      loading={eliminando}
    >
      Eliminar
    </Button>
  )
}
