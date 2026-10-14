import { Alert, Card, Center, Group, Loader, Stack, Stepper, Table, Text, Title } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link, useSearchParams } from 'react-router'
import { formatearFecha } from '../../shared/formato.ts'
import { FranjaIndicadores, SelectorPeriodo } from '../../shared/registro/componentes.tsx'
import { periodoPorId } from '../../shared/registro/registro.ts'
import { useAnteriores, useEjecuciones, usePlanes, useRestauraciones, useTablero } from './api/respaldos.ts'
import { PasoEjecucion } from './componentes/PasoEjecucion.tsx'
import { PasoPlan } from './componentes/PasoPlan.tsx'
import { PasoRestauracion } from './componentes/PasoRestauracion.tsx'

const PASOS = ['plan', 'ejecucion', 'restauracion', 'anteriores'] as const
type Paso = (typeof PASOS)[number]

/** Registros del modelo anterior al plan: se conservan intactos y solo se consultan. */
function RegistrosAnteriores() {
  const anteriores = useAnteriores()
  if (anteriores.isPending) return <Center py="md"><Loader size="sm" /></Center>
  if (anteriores.error) return <Alert color="red">{anteriores.error.message}</Alert>
  return (
    <Card withBorder>
      <Title order={4} mb="xs">Registros anteriores al plan de respaldo</Title>
      <Text size="sm" c="dimmed" mb="sm" maw={760}>
        Respaldos registrados con el modelo anterior (alcance, ejecución y prueba en un mismo registro). Se
        conservan sin cambios y solo se consultan: no tienen los datos que exige el plan (frecuencia, medio,
        RPO…) y convertirlos obligaría a inventarlos.
      </Text>
      <Table striped fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Id</Table.Th>
            <Table.Th>Activo</Table.Th>
            <Table.Th>Alcance</Table.Th>
            <Table.Th>Ejecución</Table.Th>
            <Table.Th>Prueba</Table.Th>
            <Table.Th>Registrado</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {anteriores.data.data.length === 0 && (
            <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="md">No hay registros anteriores.</Text></Table.Td></Table.Tr>
          )}
          {anteriores.data.data.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.id}</Table.Td>
              <Table.Td><Link to={`/activos/${r.activoId}`}>{r.activo.codigo}</Link></Table.Td>
              <Table.Td>{r.alcanceDetalle}</Table.Td>
              <Table.Td>{r.estadoEjecucion}{r.fechaEjecucion ? ` · ${formatearFecha(r.fechaEjecucion)}` : ''}</Table.Td>
              <Table.Td>{r.estadoPrueba}{r.fechaPrueba ? ` · ${formatearFecha(r.fechaPrueba)}` : ''}</Table.Td>
              <Table.Td>{formatearFecha(r.createdAt)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

/**
 * Respaldos y restauración en tres pasos (prototipo): alcance del plan,
 * ejecución y restauración o prueba, con indicadores del período.
 */
export function RespaldosPage() {
  const [params, setParams] = useSearchParams()
  const periodo = periodoPorId(params.get('periodo'))
  const paso: Paso = PASOS.includes(params.get('paso') as Paso) ? (params.get('paso') as Paso) : 'plan'
  const cambiar = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params)
    nuevos.set(clave, valor)
    setParams(nuevos, { replace: true })
  }

  const tablero = useTablero(periodo.desde, periodo.hasta)
  const planes = usePlanes()
  const ejecuciones = useEjecuciones(periodo.desde, periodo.hasta)
  const restauraciones = useRestauraciones(periodo.desde, periodo.hasta)
  const anteriores = useAnteriores()

  const error = planes.error ?? ejecuciones.error ?? restauraciones.error
  const vigentes = planes.data?.data.filter((p) => !p.anuladoEn && p.estado === 'VIGENTE').length ?? 0
  const pendientes = tablero.data?.pendientes

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Gestión de respaldos y restauraciones</Title>
          <Text c="dimmed" size="sm">ISO/IEC 27001:2022 · A.8.13 Respaldo de la información · A.5.30 Preparación de las TIC para la continuidad</Text>
        </div>
        <SelectorPeriodo periodo={periodo} onChange={(id) => cambiar('periodo', id)} />
      </Group>

      <FranjaIndicadores indicadores={tablero.data?.indicadores} cargando={tablero.isPending} error={tablero.error} />

      <Card withBorder>
        <Stepper
          active={PASOS.indexOf(paso)}
          onStepClick={(i) => cambiar('paso', PASOS[i])}
          allowNextStepsSelect
          size="sm"
        >
          <Stepper.Step label="Alcance del respaldo" description={`Qué activos se respaldan · ${vigentes} plan(es) vigente(s)`} />
          <Stepper.Step
            label="Ejecución del respaldo"
            description={`${ejecuciones.data?.meta.total ?? 0} en el período · ${pendientes?.ejecucion ?? 0} ventana(s) por reportar`}
          />
          <Stepper.Step
            label="Restauración o prueba"
            description={`${restauraciones.data?.meta.total ?? 0} en el período · ${pendientes?.prueba ?? 0} verificable(s) por registrar`}
          />
          {(anteriores.data?.meta.total ?? 0) > 0 && (
            <Stepper.Step label="Registros anteriores" description={`${anteriores.data?.meta.total} de solo lectura`} />
          )}
        </Stepper>
      </Card>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle />} title="No se pudieron cargar los respaldos">
          {error.message}
        </Alert>
      )}
      {(planes.isPending || ejecuciones.isPending || restauraciones.isPending) && (
        <Center py="xl"><Loader /></Center>
      )}
      {planes.data && paso === 'plan' && <PasoPlan planes={planes.data.data} tablero={tablero.data} />}
      {planes.data && ejecuciones.data && paso === 'ejecucion' && (
        <PasoEjecucion planes={planes.data.data} ejecuciones={ejecuciones.data.data} tablero={tablero.data} etiquetaPeriodo={periodo.etiqueta} />
      )}
      {planes.data && restauraciones.data && paso === 'restauracion' && (
        <PasoRestauracion planes={planes.data.data} restauraciones={restauraciones.data.data} tablero={tablero.data} etiquetaPeriodo={periodo.etiqueta} />
      )}
      {paso === 'anteriores' && <RegistrosAnteriores />}
    </Stack>
  )
}
