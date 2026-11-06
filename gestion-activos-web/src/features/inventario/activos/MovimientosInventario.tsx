import { Alert, Anchor, Badge, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { SelectorAnioBitacora } from '../../../shared/bitacora/BitacoraGeneral.tsx'
import { CampoBusqueda } from '../../../shared/bitacora/CampoBusqueda.tsx'
import { TarjetaListado } from '../../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../../shared/formato.ts'
import { NOMBRES_MES } from '../../../shared/periodo.ts'
import { useMovimientosInventario, type FiltrosMovimientos, type MovimientoInventario } from '../api/activos.ts'
import { useCategorias, useCriticidades } from '../api/catalogos.ts'
import { cambiosLegibles, ETIQUETA_ACCION, formatearValor, type NombresCatalogo } from '../ficha/bitacora-formato.ts'

type Accion = NonNullable<FiltrosMovimientos['accion']>
type Origen = NonNullable<FiltrosMovimientos['origen']>
const COLOR_ACCION: Record<Accion, string> = { CREAR: 'green', ACTUALIZAR: 'indigo', DAR_DE_BAJA: 'red', INACTIVAR: 'gray', REACTIVAR: 'teal' }
/** Tipo de operación pedido por la bitácora (alta, modificación o baja), con el detalle del módulo. */
const OPERACION: Record<Accion, string> = { CREAR: 'Alta', ACTUALIZAR: 'Modificación', DAR_DE_BAJA: 'Baja', INACTIVAR: 'Baja (inactivo en GLPI)', REACTIVAR: 'Reactivación' }

function TablaMovimientos({ filas, nombres }: { filas: MovimientoInventario[]; nombres: NombresCatalogo }) {
  return (
    <Table.ScrollContainer minWidth={1300}>
      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha del movimiento</Table.Th>
            <Table.Th>Código</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Categoría</Table.Th>
            <Table.Th>Operación</Table.Th>
            <Table.Th>Valor anterior → nuevo</Table.Th>
            <Table.Th>Usuario responsable</Table.Th>
            <Table.Th>Motivo</Table.Th>
            <Table.Th>Origen</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((m) => {
            const cambios = m.accion === 'CREAR' ? [] : cambiosLegibles(m.detalle, nombres)
            return (
              <Table.Tr key={m.id}>
                <Table.Td>{formatearFechaHora(m.fecha)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/activos/${m.activoId}`} fw={600} size="sm">{m.activo.codigo}</Anchor>
                </Table.Td>
                <Table.Td><Text size="sm" maw={220}>{m.activo.nombre}</Text></Table.Td>
                <Table.Td>{m.activo.categoria}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={COLOR_ACCION[m.accion]} title={ETIQUETA_ACCION[m.accion]}>{OPERACION[m.accion]}</Badge>
                </Table.Td>
                <Table.Td>
                  {m.accion === 'CREAR' ? (
                    <Text size="sm" c="dimmed">Registro inicial del activo</Text>
                  ) : cambios.length === 0 ? (
                    <Text size="sm" c="dimmed">—</Text>
                  ) : (
                    <Stack gap={2}>
                      {cambios.slice(0, 4).map((c) => (
                        <Text key={c.campo} size="xs">
                          <b>{c.campo}:</b> <Text span c="dimmed" size="xs">{c.antes}</Text> → {c.despues}
                        </Text>
                      ))}
                      {cambios.length > 4 && <Text size="xs" c="dimmed">y {cambios.length - 4} campo(s) más (ver la ficha)</Text>}
                    </Stack>
                  )}
                </Table.Td>
                <Table.Td>{m.responsable}</Table.Td>
                <Table.Td>{m.motivo ? formatearValor('motivoInactivo', m.motivo, nombres) : <Text size="sm" c="dimmed">No registrado</Text>}</Table.Td>
                <Table.Td>
                  <Badge variant="outline" color={m.origen === 'GLPI' ? 'grape' : 'blue'}>{m.origen === 'GLPI' ? 'Sincronización GLPI' : 'Manual'}</Badge>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Bitácora de movimientos del Inventario (consulta histórica): el Excel no define indicador de
 * Inventario, así que no hay fórmula. No es una segunda pantalla para modificar activos.
 */
export function MovimientosInventario() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | undefined>()
  const [q, setQ] = useState<string | undefined>()
  const [accion, setAccion] = useState<Accion | undefined>()
  const [origen, setOrigen] = useState<Origen | undefined>()
  const [categoriaId, setCategoriaId] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const consulta = useMovimientosInventario({ anio, mes, q, accion, origen, categoriaId, page, limit: 20 })
  const categorias = useCategorias()
  const criticidades = useCriticidades()
  const nombres = useMemo(
    () => ({
      categorias: new Map((categorias.data ?? []).map((c) => [c.id, c.nombre])),
      criticidades: new Map((criticidades.data ?? []).map((c) => [c.id, c.nivel])),
    }),
    [categorias.data, criticidades.data],
  )
  const con = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1) }
  return (
    <Stack gap="md">
      <Alert color="gray" variant="light" title="Bitácora de movimientos">
        Consulta histórica de las altas, modificaciones y bajas del inventario, con su usuario y su origen (cambio manual en la aplicación o
        sincronización con GLPI). El documento de indicadores no define uno para Inventario: aquí no hay fórmula. Para corregir un activo, use su ficha.
      </Alert>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={con(setAnio)} />
        <Select label="Mes" placeholder="Año entero" clearable data={NOMBRES_MES.map((m, i) => ({ value: String(i + 1), label: m }))} value={mes ? String(mes) : null} onChange={(v) => con(setMes)(v ? Number(v) : undefined)} w={{ base: '100%', sm: 150 }} />
        <CampoBusqueda label="Buscar" placeholder="Código o nombre del activo" valor={q} onCambio={con(setQ)} />
        <Select
          label="Operación"
          placeholder="Todas"
          clearable
          data={(Object.keys(OPERACION) as Accion[]).map((a) => ({ value: a, label: OPERACION[a] }))}
          value={accion ?? null}
          onChange={(v) => con(setAccion)((v as Accion | null) ?? undefined)}
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Origen"
          placeholder="Todos"
          clearable
          data={[{ value: 'MANUAL', label: 'Manual' }, { value: 'GLPI', label: 'Sincronización GLPI' }]}
          value={origen ?? null}
          onChange={(v) => con(setOrigen)((v as Origen | null) ?? undefined)}
          w={{ base: '100%', sm: 190 }}
        />
        <Select
          label="Categoría"
          placeholder="Todas"
          clearable
          searchable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
          value={categoriaId ? String(categoriaId) : null}
          onChange={(v) => con(setCategoriaId)(v ? Number(v) : undefined)}
          w={{ base: '100%', sm: 180 }}
        />
      </Group>
      <Title order={4}>Movimientos · {mes ? `${NOMBRES_MES[mes - 1]} ${anio}` : `año ${anio}`}</Title>
      <TarjetaListado
        consulta={consulta}
        pagina={page}
        onPagina={setPage}
        tituloError="No se pudo cargar la bitácora de movimientos"
        vacio={<Text c="dimmed">No hay movimientos en este período con esos filtros.</Text>}
      >
        {(filas) => <TablaMovimientos filas={filas} nombres={nombres} />}
      </TarjetaListado>
    </Stack>
  )
}
