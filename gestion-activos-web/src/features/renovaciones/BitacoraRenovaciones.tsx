import { Alert, Anchor, Badge, Button, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { SelectorAnioBitacora } from '../../shared/bitacora/BitacoraGeneral.tsx'
import { CampoBusqueda } from '../../shared/bitacora/CampoBusqueda.tsx'
import { EnlaceRepositorio } from '../../shared/cierre/componentes.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFecha, formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { NOMBRES_MES } from '../../shared/periodo.ts'
import { TrazasModal } from '../../shared/registro/componentes.tsx'
import { useBitacoraRenovaciones, type EstadoRenovacion, type Renovacion, type TipoRenovacion } from './api.ts'
import { ESTADOS, ETIQUETAS_RENOVACION, INFO_ESTADO, INFO_TIPO, TIPOS } from './textos.ts'

const caducidad = (fecha: string | null, sin: boolean) =>
  sin ? <Text size="sm" c="dimmed">Sin caducidad</Text> : fecha ? formatearFecha(fecha) : <Text size="sm" c="dimmed">—</Text>

function TablaBitacora({ filas, onHistorial }: { filas: Renovacion[]; onHistorial: (r: Renovacion) => void }) {
  return (
    <Table.ScrollContainer minWidth={1450}>
      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Activo, licencia o contrato</Table.Th>
            <Table.Th>Fecha de registro</Table.Th>
            <Table.Th>Caducidad anterior</Table.Th>
            <Table.Th>Fecha real de renovación</Table.Th>
            <Table.Th>Nueva caducidad</Table.Th>
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Evidencia</Table.Th>
            <Table.Th>Historial</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>
                <Anchor component={Link} to={`/renovaciones/${r.id}`} fw={600}>#{r.id}</Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>{r.activo.codigo} · {r.activo.nombre}</Text>
                <Text size="xs" c="dimmed">{INFO_TIPO[r.tipo]}</Text>
              </Table.Td>
              <Table.Td>{formatearFechaHora(r.createdAt)}</Table.Td>
              <Table.Td>{caducidad(r.fechaCaducidadActual, r.sinCaducidadActual)}</Table.Td>
              <Table.Td>{r.fechaRenovacion ? formatearFecha(r.fechaRenovacion) : <Text size="sm" c="dimmed">Sin renovar</Text>}</Table.Td>
              <Table.Td>{r.estado === 'CERRADO' ? caducidad(r.nuevaFechaCaducidad, r.nuevaSinCaducidad) : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
              <Table.Td>{r.responsable}</Table.Td>
              <Table.Td><Badge variant="light" color={INFO_ESTADO[r.estado].color}>{INFO_ESTADO[r.estado].etiqueta}</Badge></Table.Td>
              <Table.Td>
                {r.evidencia ? <Text size="sm" maw={200} lineClamp={2} title={r.evidencia}>{r.evidencia}</Text> : <Text size="sm" c="dimmed">—</Text>}
                {r.repositorioVerificable && <EnlaceRepositorio valor={r.repositorioVerificable} />}
              </Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => onHistorial(r)}>
                  Ver
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Pestaña «Bitácora» de Renovaciones: bitácora OPERATIVA. El Excel no define un indicador de
 * Renovaciones, así que no hay fórmula ni porcentaje: solo los movimientos del período
 * (renovaciones registradas o ejecutadas en él), sin anuladas. Se corrige desde la ficha.
 */
export function BitacoraRenovaciones() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | undefined>()
  const [q, setQ] = useState<string | undefined>()
  const [responsable, setResponsable] = useState<string | undefined>()
  const [estado, setEstado] = useState<EstadoRenovacion | undefined>()
  const [tipo, setTipo] = useState<TipoRenovacion | undefined>()
  const [page, setPage] = useState(1)
  const [historial, setHistorial] = useState<Renovacion | null>(null)
  const consulta = useBitacoraRenovaciones({ anio, mes, q, responsable, estado, tipo, page, limit: 20 })
  const con = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1) }
  return (
    <Stack gap="md">
      <Alert color="gray" variant="light" title="Bitácora operativa">
        El documento «Indicadores de seguimiento de Tecnología» no define un indicador de Renovaciones: aquí no se calcula fórmula ni
        porcentaje. Se listan las renovaciones registradas o ejecutadas en el período, con su caducidad anterior y la nueva.
      </Alert>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={con(setAnio)} />
        <Select
          label="Mes"
          placeholder="Año entero"
          clearable
          data={NOMBRES_MES.map((m, i) => ({ value: String(i + 1), label: m }))}
          value={mes ? String(mes) : null}
          onChange={(v) => con(setMes)(v ? Number(v) : undefined)}
          w={{ base: '100%', sm: 150 }}
        />
        <CampoBusqueda label="Buscar" placeholder="Sistema, descripción o verificable" valor={q} onCambio={con(setQ)} />
        <CampoBusqueda label="Responsable" placeholder="ANALISTA 1" valor={responsable} onCambio={con(setResponsable)} />
        <Select label="Tipo" placeholder="Todos" clearable data={TIPOS.map((t) => ({ value: t, label: INFO_TIPO[t] }))} value={tipo ?? null} onChange={(v) => con(setTipo)((v as TipoRenovacion | null) ?? undefined)} w={{ base: '100%', sm: 170 }} />
        <Select label="Estado" placeholder="Todos" clearable data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))} value={estado ?? null} onChange={(v) => con(setEstado)((v as EstadoRenovacion | null) ?? undefined)} w={{ base: '100%', sm: 150 }} />
      </Group>
      <Title order={4}>Movimientos · {mes ? `${NOMBRES_MES[mes - 1]} ${anio}` : `año ${anio}`}</Title>
      <TarjetaListado
        consulta={consulta}
        pagina={page}
        onPagina={setPage}
        tituloError="No se pudo cargar la bitácora"
        vacio={<Text c="dimmed">No hay renovaciones registradas ni ejecutadas en este período con esos filtros.</Text>}
      >
        {(filas) => <TablaBitacora filas={filas} onHistorial={setHistorial} />}
      </TarjetaListado>
      <TrazasModal
        abierto={historial !== null}
        entidad="RENOVACION"
        registroId={historial?.id ?? 0}
        titulo={historial ? `Historial de la renovación #${historial.id} · ${historial.activo.codigo}` : ''}
        etiquetas={ETIQUETAS_RENOVACION}
        onCerrar={() => setHistorial(null)}
      />
    </Stack>
  )
}
