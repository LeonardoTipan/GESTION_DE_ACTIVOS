import {
  Alert,
  Center,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Timeline,
} from '@mantine/core'
import { IconArchive, IconPencil, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { formatearFechaHora } from '../../../shared/formato.ts'
import { useBitacora } from '../api/activos.ts'
import { useCategorias, useCriticidades } from '../api/catalogos.ts'
import { cambiosLegibles, ETIQUETA_ACCION } from './bitacora-formato.ts'

const ICONO_ACCION = {
  CREAR: { icono: IconPlus, color: 'green' },
  ACTUALIZAR: { icono: IconPencil, color: 'indigo' },
  DAR_DE_BAJA: { icono: IconArchive, color: 'red' },
} as const

/** Historial del activo: quién cambió qué y cuándo (escrito por la API). */
export function BitacoraTimeline({ activoId }: { activoId: number }) {
  const [page, setPage] = useState(1)
  const { data, isPending, error } = useBitacora(activoId, page)
  const categorias = useCategorias()
  const criticidades = useCriticidades()

  const nombres = useMemo(
    () => ({
      categorias: new Map((categorias.data ?? []).map((c) => [c.id, c.nombre])),
      criticidades: new Map((criticidades.data ?? []).map((c) => [c.id, c.nivel])),
    }),
    [categorias.data, criticidades.data],
  )

  if (isPending) {
    return (
      <Center py="md">
        <Loader size="sm" />
      </Center>
    )
  }
  if (error) {
    return (
      <Alert color="red" title="No se pudo cargar la bitácora">
        {error.message}
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      <Timeline bulletSize={28} lineWidth={2}>
        {data.data.map((entrada) => {
          const { icono: Icono, color } = ICONO_ACCION[entrada.accion]
          const cambios = cambiosLegibles(entrada.detalle, nombres)
          return (
            <Timeline.Item
              key={entrada.id}
              bullet={
                <ThemeIcon size={28} radius="xl" color={color}>
                  <Icono size={16} />
                </ThemeIcon>
              }
              title={ETIQUETA_ACCION[entrada.accion]}
            >
              <Text size="xs" c="dimmed">
                {entrada.responsable} · {formatearFechaHora(entrada.fecha)}
              </Text>
              {entrada.accion !== 'CREAR' && cambios.length > 0 && (
                <Table mt="xs" withTableBorder fz="sm" maw={640}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Campo</Table.Th>
                      <Table.Th>Antes</Table.Th>
                      <Table.Th>Después</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {cambios.map((c) => (
                      <Table.Tr key={c.campo}>
                        <Table.Td>{c.campo}</Table.Td>
                        <Table.Td c="dimmed">{c.antes}</Table.Td>
                        <Table.Td>{c.despues}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Timeline.Item>
          )
        })}
      </Timeline>

      {data.meta.totalPages > 1 && (
        <Group justify="center">
          <Pagination size="sm" total={data.meta.totalPages} value={page} onChange={setPage} />
        </Group>
      )}
    </Stack>
  )
}
