import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  LoadingOverlay,
  Pagination,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react'
import { useNavigate, useSearchParams } from 'react-router'
import { usePuede } from '../../auth/use-puede.ts'
import { useActivos } from '../api/activos.ts'
import { ActivoFormModal } from './ActivoFormModal.tsx'
import { FiltrosActivos } from './FiltrosActivos.tsx'
import {
  aConsultaApi,
  escribirFiltros,
  leerFiltros,
  type FiltrosActivos as Filtros,
} from './filtros-url.ts'
import { TablaActivos } from './TablaActivos.tsx'

export function ActivosPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltros(params)
  const { data, isPending, isFetching, error } = useActivos(aConsultaApi(filtros))
  const puedeRegistrar = usePuede(['admin', 'analista'])
  const [modalAbierto, modal] = useDisclosure()

  const actualizar = (cambios: Partial<Filtros>) =>
    // Cambiar de página crea una entrada en el historial; cambiar filtros la reemplaza.
    setParams(escribirFiltros({ ...filtros, ...cambios }), {
      replace: cambios.page === undefined || cambios.page === 1,
    })

  const hayFiltros =
    Boolean(filtros.q) ||
    filtros.categoriaId !== undefined ||
    filtros.criticidadId !== undefined ||
    filtros.cifrado !== undefined

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Inventario de activos</Title>
          {data && (
            <Text c="dimmed" size="sm">
              {data.meta.total} {data.meta.total === 1 ? 'activo' : 'activos'}
              {hayFiltros && ' con los filtros aplicados'}
            </Text>
          )}
        </div>
        {puedeRegistrar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Nuevo activo
          </Button>
        )}
      </Group>

      <FiltrosActivos filtros={filtros} onChange={actualizar} />

      <Card withBorder padding={0} pos="relative">
        <LoadingOverlay visible={isFetching && !isPending} overlayProps={{ blur: 1 }} />
        {isPending && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {error && (
          <Alert m="md" color="red" icon={<IconAlertTriangle />} title="No se pudo cargar el inventario">
            {error.message}
          </Alert>
        )}
        {data && data.data.length === 0 && (
          <Stack align="center" py="xl" gap="xs">
            <Text c="dimmed">
              {hayFiltros ? 'Ningún activo coincide con los filtros.' : 'Todavía no hay activos registrados.'}
            </Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={() => setParams(new URLSearchParams())}>
                Quitar filtros
              </Button>
            )}
          </Stack>
        )}
        {data && data.data.length > 0 && <TablaActivos activos={data.data} />}
      </Card>

      {data && data.meta.totalPages > 1 && (
        <Group justify="center">
          <Pagination
            total={data.meta.totalPages}
            value={filtros.page}
            onChange={(page) => actualizar({ page })}
          />
        </Group>
      )}

      <ActivoFormModal
        opened={modalAbierto}
        onClose={modal.close}
        onGuardado={(activo) => navigate(`/activos/${activo.id}`)}
      />
    </Stack>
  )
}
