import { Alert, Button, Card, Center, Group, Loader, Pagination, Select, Stack, Stepper, Table, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { formatearFecha } from '../../shared/formato.ts'
import { FranjaIndicadores, SelectorPeriodo } from '../../shared/registro/componentes.tsx'
import { periodoPorId } from '../../shared/registro/registro.ts'
import { enteroPositivo, valorPermitido } from '../../shared/hooks/use-filtros-url.ts'
import { useCategorias } from '../inventario/api/catalogos.ts'
import {
  useAnteriores,
  useEjecuciones,
  usePlanes,
  usePlanesFiltrados,
  useRestauraciones,
  useTablero,
  type Ejecucion,
  type FiltrosRespaldo,
} from './api/respaldos.ts'
import { opciones, RESULTADO } from './catalogos.ts'
import { PasoEjecucion } from './componentes/PasoEjecucion.tsx'
import { PasoPlan } from './componentes/PasoPlan.tsx'
import { PasoRestauracion } from './componentes/PasoRestauracion.tsx'

const PASOS = ['plan', 'ejecucion', 'restauracion', 'anteriores'] as const
const RESULTADOS = Object.keys(RESULTADO) as Ejecucion['resultado'][]
const CLAVES_FILTRO = ['page', 'categoriaId', 'q', 'responsable', 'resultado'] as const

function leerFiltros(params: URLSearchParams): FiltrosRespaldo {
  return {
    page: enteroPositivo(params.get('page')) ?? 1,
    categoriaId: enteroPositivo(params.get('categoriaId')),
    q: params.get('q')?.trim() || undefined,
    responsable: params.get('responsable')?.trim() || undefined,
    resultado: valorPermitido(params.get('resultado'), RESULTADOS),
  }
}

/** Texto con espera antes de consultar la API. */
function CampoTexto({ valor, onCambio, label, placeholder }: { valor?: string; onCambio: (v?: string) => void; label: string; placeholder: string }) {
  const [texto, setTexto] = useState(valor ?? '')
  const [estable] = useDebouncedValue(texto, 400)
  useEffect(() => setTexto(valor ?? ''), [valor])
  useEffect(() => {
    if ((estable.trim() || undefined) !== valor) onCambio(estable.trim() || undefined)
  }, [estable]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al escribir
  return (
    <TextInput label={label} placeholder={placeholder} leftSection={<IconSearch size={14} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} w={{ base: '100%', sm: 220 }} />
  )
}
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
    // Al cambiar de paso se vuelve a la primera página.
    if (clave === 'paso') nuevos.delete('page')
    setParams(nuevos, { replace: true })
  }
  const filtros = leerFiltros(params)
  const filtrar = (cambios: Partial<FiltrosRespaldo>) => {
    const nuevos = new URLSearchParams(params)
    const valores = { ...filtros, page: 1, ...cambios }
    for (const clave of CLAVES_FILTRO) {
      const v = valores[clave]
      if (v === undefined || (clave === 'page' && v === 1)) nuevos.delete(clave)
      else nuevos.set(clave, String(v))
    }
    setParams(nuevos, { replace: cambios.page === undefined })
  }
  const hayFiltros = Boolean(filtros.categoriaId || filtros.q || filtros.responsable || filtros.resultado)
  const categorias = useCategorias()

  const tablero = useTablero(periodo.desde, periodo.hasta)
  const planes = usePlanes()
  const listadoPlanes = usePlanesFiltrados(filtros)
  const ejecuciones = useEjecuciones(periodo.desde, periodo.hasta, filtros)
  const restauraciones = useRestauraciones(periodo.desde, periodo.hasta, filtros)
  const anteriores = useAnteriores()

  const error = planes.error ?? listadoPlanes.error ?? ejecuciones.error ?? restauraciones.error
  const meta =
    paso === 'plan' ? listadoPlanes.data?.meta : paso === 'ejecucion' ? ejecuciones.data?.meta : paso === 'restauracion' ? restauraciones.data?.meta : undefined
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

      {paso !== 'anteriores' && (
        <Group gap="sm" align="flex-end" wrap="wrap">
          <CampoTexto label="Buscar" placeholder="Activo (código o nombre)…" valor={filtros.q} onCambio={(q) => filtrar({ q })} />
          <Select
            label="Categoría"
            placeholder="Todas"
            clearable
            searchable
            data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
            value={filtros.categoriaId ? String(filtros.categoriaId) : null}
            onChange={(v) => filtrar({ categoriaId: v ? Number(v) : undefined })}
            w={{ base: '100%', sm: 200 }}
          />
          <CampoTexto label="Responsable" placeholder="Infraestructura" valor={filtros.responsable} onCambio={(responsable) => filtrar({ responsable })} />
          {paso !== 'plan' && (
            <Select
              label="Resultado"
              placeholder="Todos"
              clearable
              data={opciones(RESULTADO)}
              value={filtros.resultado ?? null}
              onChange={(v) => filtrar({ resultado: (v as Ejecucion['resultado'] | null) ?? undefined })}
              w={{ base: '100%', sm: 150 }}
            />
          )}
          {hayFiltros && (
            <Button variant="subtle" onClick={() => filtrar({ categoriaId: undefined, q: undefined, responsable: undefined, resultado: undefined })}>
              Quitar filtros
            </Button>
          )}
        </Group>
      )}

      {error && (
        <Alert color="red" icon={<IconAlertTriangle />} title="No se pudieron cargar los respaldos">
          {error.message}
        </Alert>
      )}
      {(planes.isPending || ejecuciones.isPending || restauraciones.isPending) && (
        <Center py="xl"><Loader /></Center>
      )}
      {planes.data && listadoPlanes.data && paso === 'plan' && (
        <PasoPlan planes={planes.data.data} listado={listadoPlanes.data.data} tablero={tablero.data} />
      )}
      {planes.data && ejecuciones.data && paso === 'ejecucion' && (
        <PasoEjecucion planes={planes.data.data} ejecuciones={ejecuciones.data.data} tablero={tablero.data} etiquetaPeriodo={periodo.etiqueta} />
      )}
      {planes.data && restauraciones.data && paso === 'restauracion' && (
        <PasoRestauracion planes={planes.data.data} restauraciones={restauraciones.data.data} tablero={tablero.data} etiquetaPeriodo={periodo.etiqueta} />
      )}
      {paso === 'anteriores' && <RegistrosAnteriores />}
      {meta && meta.totalPages > 1 && (
        <Group justify="center">
          <Text size="sm" c="dimmed">{meta.total} registro(s)</Text>
          <Pagination total={meta.totalPages} value={filtros.page} onChange={(page) => filtrar({ page })} />
        </Group>
      )}
    </Stack>
  )
}
