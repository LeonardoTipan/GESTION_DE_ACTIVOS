import {
  Alert,
  Card,
  Center,
  Group,
  Loader,
  LoadingOverlay,
  Pagination,
  Stack,
  Text,
} from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { ReactNode } from 'react'

interface PaginaApi<T> {
  data: T[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

/**
 * Envoltorio común de los listados paginados: carga, error, "sin resultados",
 * recarga suave (sin parpadeo) y paginación. Cada módulo solo aporta la tabla.
 */
export function TarjetaListado<T>({
  consulta,
  pagina,
  onPagina,
  vacio,
  tituloError = 'No se pudo cargar el listado',
  children,
}: {
  consulta: {
    data?: PaginaApi<T>
    isPending: boolean
    isFetching: boolean
    error: Error | null
  }
  pagina: number
  onPagina: (pagina: number) => void
  /** Contenido a mostrar cuando no hay filas (mensaje y, si aplica, "quitar filtros"). */
  vacio: ReactNode
  tituloError?: string
  children: (filas: T[]) => ReactNode
}) {
  const { data, isPending, isFetching, error } = consulta

  return (
    <Stack gap="md">
      <Card withBorder padding={0} pos="relative">
        <LoadingOverlay visible={isFetching && !isPending} overlayProps={{ blur: 1 }} />
        {isPending && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {error && (
          <Alert m="md" color="red" icon={<IconAlertTriangle />} title={tituloError}>
            {error.message}
          </Alert>
        )}
        {data && data.data.length === 0 && (
          <Stack align="center" py="xl" gap="xs">
            {typeof vacio === 'string' ? <Text c="dimmed">{vacio}</Text> : vacio}
          </Stack>
        )}
        {data && data.data.length > 0 && children(data.data)}
      </Card>

      {data && data.meta.totalPages > 1 && (
        <Group justify="center">
          <Pagination total={data.meta.totalPages} value={pagina} onChange={onPagina} />
        </Group>
      )}
    </Stack>
  )
}
