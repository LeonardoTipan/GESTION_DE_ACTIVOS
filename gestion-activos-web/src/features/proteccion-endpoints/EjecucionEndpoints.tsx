import { Button, Group, Select, Stack, Table, Text } from '@mantine/core'
import { useState } from 'react'
import { Link } from 'react-router'
import { avisoExito as aviso, avisoFallo as fallo } from '../../shared/cierre/avisos.ts'
import { EncabezadoSeccion } from '../../shared/components/EncabezadoSeccion.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useCerrarPeriodo, usePeriodos, type EstadoPeriodo, type PeriodoEndpoint } from './api.ts'
import { BadgeEstadoPeriodo, ConfirmarCierreModal, DetallePeriodoModal } from './componentes.tsx'
import { INFO_ESTADO, MESES, nombrePeriodo, resumenParaCerrar } from './textos.ts'

const PENDIENTES: EstadoPeriodo[] = ['ABIERTO', 'EN_PROGRESO']

/**
 * Pestaña 2: los períodos por ejecutar o en progreso. La ejecución se hace en la ficha del
 * período. «Cerrar» aparece cuando ya están guardados los datos obligatorios;
 * la validación definitiva es la del backend.
 */
export function EjecucionEndpoints({ onIrAPlanificacion }: { onIrAPlanificacion: () => void }) {
  const puedeOperar = usePuedeOperar()
  const anioHoy = Number(hoyLocal().slice(0, 4))
  const [filtros, setFiltros] = useState<{ page: number; anio?: number; estado?: EstadoPeriodo }>({ page: 1 })
  const consulta = usePeriodos({ page: filtros.page, limit: 20, pendientes: true, anio: filtros.anio, estado: filtros.estado })
  const [detalle, setDetalle] = useState<PeriodoEndpoint | null>(null)
  const [porCerrar, setPorCerrar] = useState<PeriodoEndpoint | null>(null)
  const cerrar = useCerrarPeriodo()
  const hayFiltros = filtros.anio !== undefined || filtros.estado !== undefined
  const cambiar = (c: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...c }))

  const confirmarCierre = () => {
    if (!porCerrar) return
    const p = porCerrar
    cerrar.mutate(
      { id: p.id, datos: {} },
      {
        onSuccess: () => {
          aviso('Período cerrado', `${nombrePeriodo(p.anio, p.mes)} · cobertura ${p.cobertura ?? '—'} %.`)
          setPorCerrar(null)
        },
        onError: fallo('No se pudo cerrar'),
      },
    )
  }

  return (
    <Stack gap="md">
      <EncabezadoSeccion titulo="Períodos por ejecutar o en progreso" />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Año"
          placeholder="Todos"
          clearable
          data={Array.from({ length: 6 }, (_, i) => String(anioHoy - i))}
          value={filtros.anio ? String(filtros.anio) : null}
          onChange={(v) => cambiar({ anio: v ? Number(v) : undefined })}
          w={{ base: '100%', sm: 130 }}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={PENDIENTES.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => cambiar({ estado: (v as EstadoPeriodo | null) ?? undefined })}
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
        tituloError="No se pudieron cargar los períodos"
        vacio={
          <>
            <Text c="dimmed">{hayFiltros ? 'Ningún período coincide con los filtros.' : 'No hay períodos por ejecutar ni en progreso.'}</Text>
            {hayFiltros ? (
              <Button variant="subtle" onClick={() => setFiltros({ page: 1 })}>
                Quitar filtros
              </Button>
            ) : (
              puedeOperar && (
                <Button variant="subtle" onClick={onIrAPlanificacion}>
                  Ir a Planificación para abrir un período
                </Button>
              )
            )}
          </>
        }
      >
        {(periodos) => (
          <Table.ScrollContainer minWidth={980}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Año</Table.Th>
                  <Table.Th>Mes</Table.Th>
                  <Table.Th>Responsable asignado</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Fecha real de ejecución</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {periodos.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>{p.anio}</Table.Td>
                    <Table.Td>{MESES[p.mes - 1]}</Table.Td>
                    <Table.Td>{p.responsable}</Table.Td>
                    <Table.Td>
                      <BadgeEstadoPeriodo estado={p.estado} />
                    </Table.Td>
                    <Table.Td>{p.fechaEjecucion ? formatearFechaHora(p.fechaEjecucion) : '—'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {puedeOperar && (
                          <Button size="xs" component={Link} to={`/proteccion-endpoints/${p.id}`}>
                            {p.estado === 'ABIERTO' ? 'Ejecutar' : 'Continuar ejecución'}
                          </Button>
                        )}
                        <Button size="xs" variant="default" onClick={() => setDetalle(p)}>
                          Consultar detalle
                        </Button>
                        {puedeOperar && resumenParaCerrar(p) && (
                          <Button size="xs" color="green" onClick={() => setPorCerrar(p)}>
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

      {detalle && <DetallePeriodoModal p={detalle} onCerrar={() => setDetalle(null)} />}
      <ConfirmarCierreModal
        abierto={porCerrar !== null}
        resumen={porCerrar && resumenParaCerrar(porCerrar)}
        enviando={cerrar.isPending}
        onConfirmar={confirmarCierre}
        onCerrar={() => setPorCerrar(null)}
      />
    </Stack>
  )
}
