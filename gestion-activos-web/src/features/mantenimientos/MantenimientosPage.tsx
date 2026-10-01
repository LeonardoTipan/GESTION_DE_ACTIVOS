import { Anchor, Button, Group, Select, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { useFiltrosUrl } from '../../shared/hooks/use-filtros-url.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { SelectorActivo } from '../inventario/componentes/SelectorActivo.tsx'
import {
  useMantenimientos,
  type Fase,
  type Mantenimiento,
  type TipoMantenimiento,
} from './api/mantenimientos.ts'
import { BadgeEstadoEquipo, BadgeFase, BadgeTipo, BadgeVencido } from './componentes/Badges.tsx'
import { ProgramarModal } from './componentes/ProgramarModal.tsx'
import { FASES, INFO_FASE, INFO_TIPO, TIPOS } from './fases.ts'
import { aConsultaApi, escribirFiltros, leerFiltros } from './filtros-url.ts'

function TablaMantenimientos({ mantenimientos }: { mantenimientos: Mantenimiento[] }) {
  const navigate = useNavigate()
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Activo</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Actividad</Table.Th>
            <Table.Th>Fecha programada</Table.Th>
            <Table.Th>Fase</Table.Th>
            <Table.Th>Estado del equipo</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {mantenimientos.map((m) => (
            <Table.Tr
              key={m.id}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/mantenimientos/${m.id}`)}
            >
              <Table.Td>
                <Anchor
                  component={Link}
                  to={`/mantenimientos/${m.id}`}
                  fw={600}
                  onClick={(e) => e.stopPropagation()}
                >
                  #{m.id}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {m.activo.codigo}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.activo.nombre}
                </Text>
              </Table.Td>
              <Table.Td>
                <BadgeTipo tipo={m.tipo} />
              </Table.Td>
              <Table.Td maw={280}>
                <Text size="sm" lineClamp={2}>
                  {m.actividad}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={m.vencido ? 'red' : 'dimmed'} fw={m.vencido ? 600 : undefined}>
                  {formatearFechaHora(m.fecha)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <BadgeFase fase={m.fase} />
                  {m.vencido && <BadgeVencido />}
                </Group>
              </Table.Td>
              <Table.Td>
                <BadgeEstadoEquipo estado={m.estadoEquipo} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

export function MantenimientosPage() {
  const navigate = useNavigate()
  const { filtros, actualizar, limpiar } = useFiltrosUrl(leerFiltros, escribirFiltros)
  const consulta = useMantenimientos(aConsultaApi(filtros))
  const puedeOperar = usePuedeOperar()
  const [modalAbierto, modal] = useDisclosure()
  const hayFiltros =
    filtros.fase !== undefined ||
    filtros.tipo !== undefined ||
    filtros.activoId !== undefined ||
    filtros.vencidos !== undefined

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Mantenimientos</Title>
          <Text c="dimmed" size="sm">
            Programado → en ejecución → finalizado
          </Text>
        </div>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Programar mantenimiento
          </Button>
        )}
      </Group>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Fase"
          placeholder="Todas"
          clearable
          data={FASES.map((f) => ({ value: f, label: INFO_FASE[f].etiqueta }))}
          value={filtros.fase ?? null}
          onChange={(v) => actualizar({ fase: (v as Fase | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 180 }}
        />
        <Select
          label="Tipo"
          placeholder="Todos"
          clearable
          data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t].etiqueta }))}
          value={filtros.tipo ?? null}
          onChange={(v) =>
            actualizar({ tipo: (v as TipoMantenimiento | null) ?? undefined, page: 1 })
          }
          w={{ base: '100%', sm: 160 }}
        />
        <SelectorActivo
          label="Activo"
          placeholder="Todos"
          value={filtros.activoId ?? null}
          onChange={(id) => actualizar({ activoId: id ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 300 }}
        />
        <Switch
          label="Solo vencidos"
          color="red"
          checked={filtros.vencidos ?? false}
          onChange={(e) =>
            actualizar({ vencidos: e.currentTarget.checked || undefined, page: 1 })
          }
          mb={8}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudieron cargar los mantenimientos"
        vacio={
          <>
            <Text c="dimmed">
              {filtros.vencidos
                ? 'No hay mantenimientos vencidos. ¡Todo al día!'
                : hayFiltros
                  ? 'Ningún mantenimiento coincide con los filtros.'
                  : 'Todavía no hay mantenimientos programados.'}
            </Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={limpiar}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(mantenimientos) => <TablaMantenimientos mantenimientos={mantenimientos} />}
      </TarjetaListado>

      {puedeOperar && (
        <ProgramarModal
          opened={modalAbierto}
          onClose={modal.close}
          activoInicial={filtros.activoId}
          onProgramado={(m) => navigate(`/mantenimientos/${m.id}`)}
        />
      )}
    </Stack>
  )
}
