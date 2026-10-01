import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { CatalogoFormModal } from './CatalogoFormModal.tsx'
import type { ConfigCatalogo } from './config-catalogo.ts'

/** Tabla con alta, edición y eliminación para cualquier catálogo. */
export function TablaCatalogo<
  TFila extends { id: number },
  TDatos extends Record<string, string>,
>({ config }: { config: ConfigCatalogo<TFila, TDatos> }) {
  const { data: filas, isPending, error } = config.useLista()
  const eliminar = config.useEliminar()
  // undefined = cerrado · null = alta · fila = edición
  const [editando, setEditando] = useState<TFila | null | undefined>(undefined)
  const principal = config.campos[0].clave

  const confirmarEliminar = (fila: TFila) =>
    modals.openConfirmModal({
      title: `Eliminar ${config.singular}`,
      children: (
        <Text size="sm">
          ¿Eliminar «{String(fila[principal])}»? Si algún activo la usa, la API no lo permitirá.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        eliminar.mutate(fila.id, {
          onSuccess: () =>
            notifications.show({
              color: 'green',
              title: 'Eliminado',
              message: String(fila[principal]),
            }),
          // 409 si está en uso: el mensaje de la API indica cuántos activos la usan.
          onError: (e) =>
            notifications.show({ color: 'red', title: 'No se pudo eliminar', message: e.message }),
        }),
    })

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando(null)}>
          Nueva {config.singular}
        </Button>
      </Group>

      {isPending && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {error && (
        <Alert color="red" title="No se pudo cargar el catálogo">
          {error.message}
        </Alert>
      )}
      {filas && (
        <Table striped highlightOnHover withTableBorder verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              {config.campos.map((c) => (
                <Table.Th key={c.clave}>{c.etiqueta}</Table.Th>
              ))}
              <Table.Th w={100} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={config.campos.length + 1}>
                  <Text c="dimmed" ta="center" py="md">
                    Sin elementos todavía.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {filas.map((fila) => (
              <Table.Tr key={fila.id}>
                {config.campos.map((c) => (
                  <Table.Td key={c.clave} fw={c.clave === principal ? 500 : undefined}>
                    {String(fila[c.clave] ?? '') || '—'}
                  </Table.Td>
                ))}
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label="Editar">
                      <ActionIcon variant="subtle" onClick={() => setEditando(fila)}>
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Eliminar">
                      <ActionIcon variant="subtle" color="red" onClick={() => confirmarEliminar(fila)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <CatalogoFormModal
        config={config}
        fila={editando ?? undefined}
        opened={editando !== undefined}
        onClose={() => setEditando(undefined)}
      />
    </Stack>
  )
}
