import { Alert, Anchor, Badge, Card, Center, Group, Loader, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Link } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { useBitacoraEspecifica, useBitacoraGeneral, type ResumenBitacora, type SituacionEvaluacion } from './api.ts'
import { INFO_SITUACION, SITUACIONES } from './textos.ts'

/** Un semestre (o el año) de la Bitácora General: cifras reales del backend, sin recalcular. */
function TarjetaSemestre({ r }: { r: ResumenBitacora }) {
  const dato = (etiqueta: string, valor: number | string, color?: string) => (
    <div>
      <Text size="xs" c="dimmed">{etiqueta}</Text>
      <Text fw={700} c={color}>{valor}</Text>
    </div>
  )
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="xs">
        <Title order={5}>{r.periodo.etiqueta}</Title>
        <Badge variant="light" color={r.cumplimiento === null ? 'gray' : r.cumplimiento >= 90 ? 'green' : r.cumplimiento >= 70 ? 'yellow' : 'red'}>
          {r.cumplimiento === null ? 'Sin planificadas' : `Cumplimiento ${r.cumplimiento} %`}
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
        {dato('Planificadas', r.planificadas)}
        {dato('Cumplidas a tiempo', r.cumplidasATiempo, 'green')}
        {dato('Cumplidas tarde', r.cumplidasTarde, 'orange')}
        {dato('Pendientes', r.pendientes)}
        {dato('Vencidas', r.vencidas, r.vencidas ? 'red' : undefined)}
        {dato('Cerradas en el semestre (fecha real)', r.cerradasEnElSemestre)}
      </SimpleGrid>
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
  const general = useBitacoraGeneral(anio, semestre)
  const especifica = useBitacoraEspecifica({ anio, semestre, situacion, page: pagina, limit: 20 })
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

      <Title order={4}>Bitácora General</Title>
      {general.error ? (
        <Alert color="red">{general.error.message}</Alert>
      ) : !general.data ? (
        <Center py="md"><Loader size="sm" /></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, md: general.data.semestres.length > 1 ? 3 : 2 }}>
          {general.data.semestres.map((r) => <TarjetaSemestre key={r.periodo.etiqueta} r={r} />)}
          {general.data.semestres.length > 1 && <TarjetaSemestre r={general.data.total} />}
        </SimpleGrid>
      )}

      <Title order={4}>Bitácora Específica</Title>
      <TarjetaListado
        consulta={especifica}
        pagina={pagina}
        onPagina={setPagina}
        tituloError="No se pudo cargar la bitácora"
        vacio={<Text c="dimmed">No hay evaluaciones con esos filtros.</Text>}
      >
        {(filas) => (
          <Table.ScrollContainer minWidth={950}>
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N.º</Table.Th>
                  <Table.Th>Sistema</Table.Th>
                  <Table.Th>Paso a producción programado</Table.Th>
                  <Table.Th>Pruebas reales</Table.Th>
                  <Table.Th>Asignado</Table.Th>
                  <Table.Th>Situación</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/evaluacion-sistemas-productivos/${e.id}`} ff="monospace" size="sm">#{e.id}</Anchor>
                    </Table.Td>
                    <Table.Td>{e.activo.codigo} · {e.activo.nombre}</Table.Td>
                    <Table.Td>
                      {formatearFechaHora(e.fechaProgramadaProduccion)}
                      <Text size="xs" c="dimmed">{e.semestrePlanificado}</Text>
                    </Table.Td>
                    <Table.Td>
                      {e.fechaPruebas ? formatearFechaHora(e.fechaPruebas) : '—'}
                      {e.semestreReal && <Text size="xs" c="dimmed">{e.semestreReal}</Text>}
                    </Table.Td>
                    <Table.Td>{e.responsable}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={INFO_SITUACION[e.situacion].color}>{INFO_SITUACION[e.situacion].etiqueta}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </TarjetaListado>
    </Stack>
  )
}
