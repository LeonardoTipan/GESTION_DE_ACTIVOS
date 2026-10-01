import { Anchor, Button, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { usePuede } from '../auth/use-puede.ts'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import { useRespaldos, type Etapa, type Respaldo } from './api/respaldos.ts'
import { BadgeEtapa } from './componentes/BadgeEtapa.tsx'
import { NuevoRespaldoModal } from './componentes/NuevoRespaldoModal.tsx'
import { ETAPAS, INFO_ETAPA } from './etapas.ts'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

function TablaRespaldos({ respaldos }: { respaldos: Respaldo[] }) {
  const navigate = useNavigate()
  return (
    <Table.ScrollContainer minWidth={820}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Activo</Table.Th>
            <Table.Th>Alcance</Table.Th>
            <Table.Th>Etapa</Table.Th>
            <Table.Th>Ejecución</Table.Th>
            <Table.Th>Prueba</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {respaldos.map((r) => (
            <Table.Tr
              key={r.id}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/respaldos/${r.id}`)}
            >
              <Table.Td>
                <Anchor
                  component={Link}
                  to={`/respaldos/${r.id}`}
                  fw={600}
                  onClick={(e) => e.stopPropagation()}
                >
                  #{r.id}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {r.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed">
                  {r.activo.nombre}
                </Text>
              </Table.Td>
              <Table.Td maw={280}>
                <Text size="sm" lineClamp={2}>
                  {r.alcanceDetalle}
                </Text>
              </Table.Td>
              <Table.Td>
                <BadgeEtapa etapa={r.etapa} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatearFechaHora(r.fechaEjecucion)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatearFechaHora(r.fechaPrueba)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

export function RespaldosPage() {
  const navigate = useNavigate()
  const { filtros, actualizar, limpiar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const consulta = useRespaldos(aConsultaApi(filtros))
  const puedeRegistrar = usePuede(['admin', 'analista'])
  const [modalAbierto, modal] = useDisclosure()
  const hayFiltros = filtros.etapa !== undefined || filtros.activoId !== undefined

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Respaldos</Title>
          <Text c="dimmed" size="sm">
            Alcance → ejecución → prueba de restauración
          </Text>
        </div>
        {puedeRegistrar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Nuevo respaldo
          </Button>
        )}
      </Group>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Etapa"
          placeholder="Todas"
          clearable
          data={ETAPAS.map((e) => ({ value: e, label: INFO_ETAPA[e].etiqueta }))}
          value={filtros.etapa ?? null}
          onChange={(v) => actualizar({ etapa: (v as Etapa | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 220 }}
        />
        <SelectorActivo
          label="Activo"
          placeholder="Todos"
          value={filtros.activoId ?? null}
          onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 320 }}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudieron cargar los respaldos"
        vacio={
          <>
            <Text c="dimmed">
              {hayFiltros
                ? 'Ningún respaldo coincide con los filtros.'
                : 'Todavía no hay respaldos registrados.'}
            </Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={limpiar}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(respaldos) => <TablaRespaldos respaldos={respaldos} />}
      </TarjetaListado>

      <NuevoRespaldoModal
        opened={modalAbierto}
        onClose={modal.close}
        activoInicial={filtros.activoId}
        onCreado={(r) => navigate(`/respaldos/${r.id}`)}
      />
    </Stack>
  )
}
