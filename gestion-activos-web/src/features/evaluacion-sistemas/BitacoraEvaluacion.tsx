import { Alert, Anchor, Badge, Button, Card, Center, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { Link } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { BitacoraGeneral } from '../../shared/bitacora/BitacoraGeneral.tsx'
import { useBitacoraEspecifica, useBitacoraIndicadorEvaluacion, useSistemasProduccion, type EvaluacionSistema, type SituacionEvaluacion } from './api.ts'
import { DetalleEvaluacionModal } from './componentes.tsx'
import { INFO_SITUACION, SITUACIONES } from './textos.ts'

/** Los sistemas del denominador (inventario de producción al corte) y si se evaluaron en el semestre. */
function SistemasDelSemestre({ anio, semestre }: { anio: number; semestre: 1 | 2 }) {
  const sistemas = useSistemasProduccion(anio, semestre)
  if (sistemas.error) return <Alert color="red">{sistemas.error.message}</Alert>
  if (!sistemas.data) return <Center py="md"><Loader size="sm" /></Center>
  const evaluados = sistemas.data.filter((s) => s.evaluado).length
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="xs">
        <Title order={5}>Sistemas en producción · S{semestre}-{anio}</Title>
        <Badge variant="light">{evaluados} de {sistemas.data.length} evaluados</Badge>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">El total del indicador: inventario de producción al cierre del semestre (o hoy, si está en curso).</Text>
      {sistemas.data.length === 0 ? (
        <Text size="sm" c="dimmed">No había sistemas en producción en el inventario.</Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table striped verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th>
                <Table.Th>Sistema</Table.Th>
                <Table.Th>Categoría</Table.Th>
                <Table.Th>Evaluado en el semestre</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sistemas.data.map((s) => (
                <Table.Tr key={s.activo.id}>
                  <Table.Td fw={500}>{s.activo.codigo}</Table.Td>
                  <Table.Td>{s.activo.nombre}</Table.Td>
                  <Table.Td>{s.activo.categoria}</Table.Td>
                  <Table.Td>
                    {s.evaluado ? (
                      <Group gap={4}>
                        <Badge size="sm" variant="light" color="green">Sí</Badge>
                        {s.evaluaciones.map((id) => (
                          <Anchor key={id} component={Link} to={`/evaluacion-sistemas-productivos/${id}`} size="xs" ff="monospace">#{id}</Anchor>
                        ))}
                      </Group>
                    ) : (
                      <Badge size="sm" variant="light" color="orange">No</Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  )
}

/**
 * Bitácora de Evaluación de Sistemas Productivos (criterio de la de Mantenimientos): General
 * por semestres (planificadas por fecha programada; cerradas por su fecha real) y Específica
 * (una fila por evaluación, con sus fechas planificada y real y su situación).
 */
export function BitacoraEvaluacion() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [semestre, setSemestre] = useState<1 | 2 | undefined>()
  const [situacion, setSituacion] = useState<SituacionEvaluacion | undefined>()
  const [pagina, setPagina] = useState(1)
  const indicador = useBitacoraIndicadorEvaluacion(anio)
  const [segun, setSegun] = useState<'PLANIFICACION' | 'PRUEBAS'>('PLANIFICACION')
  const especifica = useBitacoraEspecifica({ anio, semestre, situacion, segun, page: pagina, limit: 20 })
  const [detalle, setDetalle] = useState<EvaluacionSistema | null>(null)
  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Año planificado"
          allowDeselect={false}
          data={Array.from({ length: 6 }, (_, i) => String(anioActual + 1 - i))}
          value={String(anio)}
          onChange={(v) => { setAnio(Number(v)); setPagina(1) }}
          w={{ base: '100%', sm: 140 }}
        />
        <Select
          label="Semestre"
          placeholder="Ambos"
          clearable
          data={[{ value: '1', label: 'S1 (ene–jun)' }, { value: '2', label: 'S2 (jul–dic)' }]}
          value={semestre ? String(semestre) : null}
          onChange={(v) => { setSemestre(v ? (Number(v) as 1 | 2) : undefined); setPagina(1) }}
          w={{ base: '100%', sm: 160 }}
        />
        <Select
          label="Situación"
          placeholder="Todas"
          clearable
          data={SITUACIONES.map((s) => ({ value: s, label: INFO_SITUACION[s].etiqueta }))}
          value={situacion ?? null}
          onChange={(v) => { setSituacion((v as SituacionEvaluacion | null) ?? undefined); setPagina(1) }}
          w={{ base: '100%', sm: 180 }}
        />
      </Group>

      <BitacoraGeneral consulta={indicador} seleccionado={semestre} onSeleccionar={(s) => { setSemestre(s as 1 | 2 | undefined); setPagina(1) }} />
      {semestre && <SistemasDelSemestre anio={anio} semestre={semestre} />}

      <Title order={4}>Bitácora Específica</Title>
      <Group gap="sm" align="flex-end">
        <Select
          label="Período según"
          allowDeselect={false}
          data={[
            { value: 'PLANIFICACION', label: 'Fecha planificada' },
            { value: 'PRUEBAS', label: 'Fecha real de pruebas (cerradas)' },
          ]}
          value={segun}
          onChange={(v) => { setSegun(v === 'PRUEBAS' ? 'PRUEBAS' : 'PLANIFICACION'); setPagina(1) }}
          w={{ base: '100%', sm: 260 }}
          description="«Fecha real de pruebas» lista exactamente las que cuentan en el indicador."
        />
      </Group>
      <TarjetaListado
        consulta={especifica}
        pagina={pagina}
        onPagina={setPagina}
        tituloError="No se pudo cargar la bitácora"
        vacio={<Text c="dimmed">No hay evaluaciones con esos filtros.</Text>}
      >
        {(filas) => (
          <Table.ScrollContainer minWidth={1250}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N.º</Table.Th>
                  <Table.Th>Sistema</Table.Th>
                  <Table.Th>Fecha planificada</Table.Th>
                  <Table.Th>Fecha real</Table.Th>
                  <Table.Th>Responsable</Table.Th>
                  <Table.Th>Situación</Table.Th>
                  <Table.Th>Verificable</Table.Th>
                  <Table.Th>Repositorio</Table.Th>
                  <Table.Th>Observaciones</Table.Th>
                  <Table.Th>Detalle</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/evaluacion-sistemas-productivos/${e.id}`} ff="monospace" size="sm">#{e.id}</Anchor>
                    </Table.Td>
                    <Table.Td>
                      {e.activo.codigo} · {e.activo.nombre}
                      <Text size="xs" c="dimmed">{e.activo.categoria}</Text>
                    </Table.Td>
                    <Table.Td>
                      {formatearFechaHora(e.fechaProgramadaProduccion)}
                      <Text size="xs" c="dimmed">{e.semestrePlanificado}</Text>
                    </Table.Td>
                    <Table.Td>
                      {e.fechaPruebas ? formatearFechaHora(e.fechaPruebas) : '—'}
                      {e.semestreReal && <Text size="xs" c="dimmed">{e.semestreReal}</Text>}
                    </Table.Td>
                    <Table.Td>
                      {e.responsable}
                      {e.responsableEjecucion && <Text size="xs" c="dimmed">Ejecutó: {e.responsableEjecucion}</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={INFO_SITUACION[e.situacion].color} style={{ minWidth: 'max-content' }}>{INFO_SITUACION[e.situacion].etiqueta}</Badge>
                    </Table.Td>
                    <Table.Td maw={200}><Text size="sm" lineClamp={2}>{e.evidencia ?? '—'}</Text></Table.Td>
                    <Table.Td maw={200}><Text size="sm" lineClamp={2} component="div"><EnlaceRepositorio valor={e.repositorioVerificable} /></Text></Table.Td>
                    <Table.Td maw={220}><Text size="sm" lineClamp={2} title={e.observacion ?? undefined}>{e.observacion ?? '—'}</Text></Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="default" onClick={() => setDetalle(e)}>Ver detalle</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>
      {detalle && <DetalleEvaluacionModal e={detalle} onCerrar={() => setDetalle(null)} />}
    </Stack>
  )
}
