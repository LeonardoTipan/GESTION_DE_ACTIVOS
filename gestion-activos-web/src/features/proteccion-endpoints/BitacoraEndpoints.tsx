import { Badge, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { EncabezadoSeccion } from '../../shared/components/EncabezadoSeccion.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { BitacoraMensual } from './BitacoraMensual.tsx'
import { usePeriodos, type EstadoPeriodo, type PeriodoEndpoint } from './api.ts'
import { BadgeCobertura, BadgeEstadoPeriodo, DetallePeriodoModal, FiltrosEquipo } from './componentes.tsx'
import { ESTADOS, INFO_ESTADO, MESES } from './textos.ts'

interface Filtros {
  page: number
  q: string
  responsable: string
  estado?: EstadoPeriodo
  anio?: number
  mes?: number
  activo?: string
  categoriaId?: number
}

/**
 * Pestaña 3: historial de todos los períodos, sea cual sea su estado. Es solo de consulta: no
 * hay ninguna acción que modifique los resultados.
 */
export function BitacoraEndpoints() {
  const anioHoy = Number(hoyLocal().slice(0, 4))
  const [filtros, setFiltros] = useState<Filtros>({ page: 1, q: '', responsable: '' })
  const [q] = useDebouncedValue(filtros.q.trim(), 300)
  const [responsable] = useDebouncedValue(filtros.responsable.trim(), 300)
  const consulta = usePeriodos({
    page: filtros.page,
    limit: 20,
    q: q || undefined,
    responsable: responsable || undefined,
    estado: filtros.estado,
    anio: filtros.anio,
    mes: filtros.mes,
    activo: filtros.activo,
    categoriaId: filtros.categoriaId,
    incluirAnulados: true,
  })
  const [detalle, setDetalle] = useState<PeriodoEndpoint | null>(null)
  const cambiar = (c: Partial<Filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))
  const hayFiltros = Boolean(filtros.q || filtros.responsable || filtros.estado || filtros.anio || filtros.mes || filtros.activo || filtros.categoriaId)

  return (
    <Stack gap="md">
      <BitacoraMensual />
      <EncabezadoSeccion titulo="Historial de períodos" />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar por año o mes"
          placeholder="2026, octubre…"
          leftSection={<IconSearch size={16} />}
          value={filtros.q}
          onChange={(e) => cambiar({ q: e.currentTarget.value })}
          w={{ base: '100%', sm: 200 }}
        />
        <TextInput
          label="Responsable"
          placeholder="Asignado o de la ejecución"
          value={filtros.responsable}
          onChange={(e) => cambiar({ responsable: e.currentTarget.value })}
          w={{ base: '100%', sm: 220 }}
        />
        <FiltrosEquipo onCambio={(f) => cambiar(f)} />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as EstadoPeriodo | null) ?? undefined })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Período: año"
          placeholder="Todos"
          clearable
          data={Array.from({ length: 8 }, (_, i) => String(anioHoy - i))}
          value={filtros.anio ? String(filtros.anio) : null}
          onChange={(v) => cambiar({ anio: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 130 }}
        />
        <Select
          label="Período: mes"
          placeholder="Todos"
          clearable
          data={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
          value={filtros.mes ? String(filtros.mes) : null}
          onChange={(v) => cambiar({ mes: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 150 }}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => setFiltros((f) => ({ ...f, page }))}
        tituloError="No se pudo cargar la bitácora"
        vacio={
          <>
            <Text c="dimmed">{hayFiltros ? 'Ningún período coincide con los filtros.' : 'Todavía no hay períodos registrados.'}</Text>
            {hayFiltros && (
              <Button variant="subtle" onClick={() => setFiltros((f) => ({ page: 1, q: '', responsable: '', activo: f.activo, categoriaId: f.categoriaId }))}>
                Quitar filtros
              </Button>
            )}
          </>
        }
      >
        {(periodos) => (
          <Table.ScrollContainer minWidth={1250}>
            <Table striped verticalSpacing="xs" horizontalSpacing={8} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Año</Table.Th>
                  <Table.Th>Mes</Table.Th>
                  <Table.Th>Responsable asignado</Table.Th>
                  <Table.Th>Responsable de ejecución</Table.Th>
                  <Table.Th>Fecha planificada</Table.Th>
                  <Table.Th>Fecha real de ejecución</Table.Th>
                  <Table.Th>Total de activos</Table.Th>
                  <Table.Th>Con antivirus</Table.Th>
                  <Table.Th>Sin antivirus</Table.Th>
                  <Table.Th>Cobertura</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Detalle</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {periodos.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>{p.anio}</Table.Td>
                    <Table.Td>{MESES[p.mes - 1]}</Table.Td>
                    <Table.Td>{p.responsable}</Table.Td>
                    <Table.Td>{p.responsableEjecucion ?? '—'}</Table.Td>
                    <Table.Td>{p.fechaPlanificada ? formatearFechaHora(p.fechaPlanificada) : '—'}</Table.Td>
                    <Table.Td>{p.fechaEjecucion ? formatearFechaHora(p.fechaEjecucion) : '—'}</Table.Td>
                    <Table.Td>{p.totalActivos ?? '—'}</Table.Td>
                    <Table.Td>{p.equiposConAntivirus ?? '—'}</Table.Td>
                    <Table.Td>{p.equiposSinAntivirus ?? '—'}</Table.Td>
                    <Table.Td>
                      <BadgeCobertura cobertura={p.cobertura} />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4} align="flex-start">
                        <BadgeEstadoPeriodo estado={p.estado} porEjecutar={p.porEjecutar} />
                        {p.anuladoEn && <Badge size="sm" variant="light" color="red">Anulado</Badge>}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="default" onClick={() => setDetalle(p)}>
                        Ver detalle
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>

      {detalle && <DetallePeriodoModal p={detalle} onCerrar={() => setDetalle(null)} />}
    </Stack>
  )
}
