import { Anchor, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { EncabezadoSeccion } from '../../shared/components/EncabezadoSeccion.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCategoriasConActivos } from '../inventario/api/activos.ts'
import { useCerrarEvaluacion, useEvaluaciones, type EstadoEvaluacion, type EvaluacionSistema } from './api.ts'
import { BadgeEstadoEvaluacion, ConfirmarCierreEvaluacionModal, DetalleEvaluacionModal } from './componentes.tsx'
import { INFO_ESTADO, periodoPlanificado, resumenParaCerrarEvaluacion } from './textos.ts'

const PENDIENTES: EstadoEvaluacion[] = ['ABIERTO', 'EN_PROGRESO']

/**
 * Pestaña 2: evaluaciones por ejecutar o en progreso. La ejecución se hace en la ficha. «Cerrar»
 * aparece cuando ya están guardados los datos obligatorios; la validación definitiva es del backend.
 */
export function EjecucionEvaluacion({ onIrAPlanificacion }: { onIrAPlanificacion: () => void }) {
  const puedeOperar = usePuedeOperar()
  const [filtros, setFiltros] = useState<{ page: number; q: string; estado?: EstadoEvaluacion; categoriaId?: number }>({ page: 1, q: '' })
  const [q] = useDebouncedValue(filtros.q.trim(), 300)
  const categorias = useCategoriasConActivos({ operativos: false, aplica: 'EVALUACION' })
  const consulta = useEvaluaciones({ page: filtros.page, limit: 20, pendientes: true, q: q || undefined, estado: filtros.estado, categoriaId: filtros.categoriaId })
  const [detalle, setDetalle] = useState<EvaluacionSistema | null>(null)
  const [porCerrar, setPorCerrar] = useState<EvaluacionSistema | null>(null)
  const cerrar = useCerrarEvaluacion()
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.categoriaId)
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))
  const resumen = porCerrar && resumenParaCerrarEvaluacion(porCerrar)

  const confirmarCierre = () => {
    if (!porCerrar) return
    const e = porCerrar
    cerrar.mutate(
      { id: e.id, datos: {} },
      {
        onSuccess: () => {
          aviso('Evaluación cerrada', `${e.activo.codigo} · queda en la bitácora.`)
          setPorCerrar(null)
        },
        onError: fallo('No se pudo cerrar'),
      },
    )
  }

  return (
    <Stack gap="md">
      <EncabezadoSeccion titulo="Evaluaciones por ejecutar o en progreso" />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput label="Buscar" placeholder="Sistema, descripción, responsable…" leftSection={<IconSearch size={14} />} value={filtros.q} onChange={(e) => cambiar({ q: e.currentTarget.value })} w={{ base: '100%', sm: 240 }} />
        <Select
          label="Categoría"
          placeholder="Todas"
          clearable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.categoriaId), label: c.nombre }))}
          value={filtros.categoriaId ? String(filtros.categoriaId) : null}
          onChange={(v) => cambiar({ categoriaId: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 180 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={PENDIENTES.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as EstadoEvaluacion | null) ?? undefined })}
          w={{ base: '100%', sm: 160 }}
        />
      </Group>
      {puedeOperar && (
        <Text size="xs" c="dimmed">
          «Cerrar» aparece cuando ya están guardados todos los datos obligatorios. Si falta alguno, complételo con «Ejecutar» o «Continuar ejecución».
        </Text>
      )}

      <TarjetaListado
        consulta={consulta}
        pagina={filtros.page}
        onPagina={(page) => setFiltros((f) => ({ ...f, page }))}
        tituloError="No se pudieron cargar las evaluaciones"
        vacio={
          <>
            <Text c="dimmed">{hayFiltros ? 'Ninguna evaluación coincide con los filtros.' : 'No hay evaluaciones por ejecutar ni en progreso.'}</Text>
            {hayFiltros ? (
              <Button variant="subtle" onClick={() => setFiltros({ page: 1, q: '' })}>
                Quitar filtros
              </Button>
            ) : (
              puedeOperar && (
                <Button variant="subtle" onClick={onIrAPlanificacion}>
                  Ir a Planificación para planificar una evaluación
                </Button>
              )
            )}
          </>
        }
      >
        {(evaluaciones) => (
          <Table.ScrollContainer minWidth={1100}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sistema</Table.Th>
                  <Table.Th>Fecha planificada</Table.Th>
                  <Table.Th>Responsable asignado</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Fecha real de las pruebas</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {evaluaciones.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/activos/${e.activoId}`} size="sm" fw={600}>
                        {e.activo.codigo}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {e.activo.nombre} · {e.activo.categoria}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {formatearFechaHora(e.fechaProgramadaProduccion)}
                      <Text size="xs" c="dimmed">
                        {periodoPlanificado(e)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{e.responsable}</Table.Td>
                    <Table.Td>
                      <BadgeEstadoEvaluacion e={e} />
                    </Table.Td>
                    <Table.Td>{e.fechaPruebas ? formatearFechaHora(e.fechaPruebas) : '—'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {puedeOperar && (
                          <Button size="xs" component={Link} to={`/evaluacion-sistemas-productivos/${e.id}`}>
                            {e.estado === 'ABIERTO' ? 'Ejecutar' : 'Continuar ejecución'}
                          </Button>
                        )}
                        <Button size="xs" variant="default" onClick={() => setDetalle(e)}>
                          Consultar detalle
                        </Button>
                        {puedeOperar && resumenParaCerrarEvaluacion(e) && (
                          <Button size="xs" color="green" onClick={() => setPorCerrar(e)}>
                            Cerrar
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>

      {detalle && <DetalleEvaluacionModal e={detalle} onCerrar={() => setDetalle(null)} />}
      <ConfirmarCierreEvaluacionModal resumen={resumen} enviando={cerrar.isPending} onConfirmar={confirmarCierre} onCerrar={() => setPorCerrar(null)} />
    </Stack>
  )
}
