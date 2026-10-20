import { Anchor, Badge, Button, Group, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDebouncedValue, useDisclosure } from '@mantine/hooks'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora } from '../../shared/formato.ts'
import { instante } from '../../shared/zona.ts'
import { usePuedeOperar } from '../auth/use-puede.ts'
import { useSolicitudes, type EstadoSolicitud, type Situacion, type Solicitud, type TipoAcceso, type TipoSolicitud } from './api.ts'
import { SolicitudFormModal } from './SolicitudFormModal.tsx'
import { destino, ESTADO, SITUACION, TIPO_ACCESO, TIPO_SOLICITUD } from './textos.ts'

const opciones = <K extends string>(r: Record<K, { etiqueta: string } | string>) =>
  (Object.keys(r) as K[]).map((k) => ({ value: k, label: typeof r[k] === 'string' ? (r[k] as string) : (r[k] as { etiqueta: string }).etiqueta }))

/** Control de acceso: solicitudes de acceso lógico y físico (ISO/IEC 27001 A.5.15, A.5.18, A.7.2). */
export function ControlAccesoPage() {
  const navigate = useNavigate()
  const puedeOperar = usePuedeOperar()
  const [nueva, modal] = useDisclosure()
  const [busqueda, setBusqueda] = useState('')
  const [q] = useDebouncedValue(busqueda.trim(), 300)
  const [tipoAcceso, setTipoAcceso] = useState<'' | TipoAcceso>('')
  const [estado, setEstado] = useState<EstadoSolicitud | null>(null)
  const [tipoSolicitud, setTipoSolicitud] = useState<TipoSolicitud | null>(null)
  const [situacion, setSituacion] = useState<Situacion | null>(null)
  const [rango, setRango] = useState<[string | null, string | null]>([null, null])
  const [page, setPage] = useState(1)
  const reiniciar = <T,>(fijar: (v: T) => void) => (v: T) => {
    fijar(v)
    setPage(1)
  }

  const consulta = useSolicitudes({
    page,
    limit: 20,
    q: q || undefined,
    tipoAcceso: tipoAcceso || undefined,
    estado: estado ?? undefined,
    tipoSolicitud: tipoSolicitud ?? undefined,
    situacion: situacion ?? undefined,
    // Días completos de la fecha deseada, en la hora de la institución.
    desde: rango[0] ? instante(`${rango[0]} 00:00:00`).toISOString() : undefined,
    hasta: rango[1] ? instante(`${rango[1]} 23:59:59`).toISOString() : undefined,
  })
  const hayFiltros = Boolean(q || tipoAcceso || estado || tipoSolicitud || situacion || rango[0])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Control de acceso</Title>
          <Text c="dimmed" size="sm">
            Solicitudes de acceso lógico (CAL) y físico (CAF): alta o baja, seguimiento y cierre, con historial de cada cambio.
          </Text>
          <Text c="dimmed" size="xs">
            ISO/IEC 27001:2022 · A.5.15 Control de acceso · A.5.18 Derechos de acceso · A.7.2 Entrada física
          </Text>
        </div>
        {puedeOperar && (
          <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
            Nueva solicitud
          </Button>
        )}
      </Group>

      <Group gap="sm" align="flex-end" wrap="wrap">
        <SegmentedControl
          data={[{ value: '', label: 'Todas' }, ...opciones(TIPO_ACCESO)]}
          value={tipoAcceso}
          onChange={reiniciar((v: string) => setTipoAcceso(v as '' | TipoAcceso))}
        />
        <TextInput
          label="Buscar"
          placeholder="Código, beneficiario, departamento, recurso o activo"
          leftSection={<IconSearch size={14} />}
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.currentTarget.value)
            setPage(1)
          }}
          w={{ base: '100%', sm: 300 }}
        />
        <Select label="Estado" placeholder="Todos" clearable data={opciones(ESTADO)} value={estado} onChange={reiniciar((v) => setEstado(v as EstadoSolicitud | null))} w={{ base: '100%', sm: 140 }} />
        <Select label="Solicitud" placeholder="Todas" clearable data={opciones(TIPO_SOLICITUD)} value={tipoSolicitud} onChange={reiniciar((v) => setTipoSolicitud(v as TipoSolicitud | null))} w={{ base: '100%', sm: 130 }} />
        <Select label="Fecha deseada" placeholder="Cualquiera" clearable data={opciones(SITUACION)} value={situacion} onChange={reiniciar((v) => setSituacion(v as Situacion | null))} w={{ base: '100%', sm: 170 }} />
        <DatePickerInput
          type="range"
          label="Entre fechas deseadas"
          placeholder="Desde – hasta"
          valueFormat="DD MMM YYYY"
          clearable
          value={rango}
          onChange={reiniciar((v: [string | null, string | null]) => setRango(v))}
          w={{ base: '100%', sm: 240 }}
        />
      </Group>

      <TarjetaListado
        consulta={consulta}
        pagina={page}
        onPagina={setPage}
        tituloError="No se pudieron cargar las solicitudes"
        vacio={
          <Text c="dimmed">
            {hayFiltros ? 'Ninguna solicitud coincide con los filtros.' : 'Todavía no hay solicitudes de acceso registradas.'}
          </Text>
        }
      >
        {(solicitudes) => <TablaSolicitudes solicitudes={solicitudes} />}
      </TarjetaListado>

      <SolicitudFormModal abierto={nueva} onCerrar={modal.close} onGuardada={(s) => navigate(`/control-acceso/${s.id}`)} />
    </Stack>
  )
}

function TablaSolicitudes({ solicitudes }: { solicitudes: Solicitud[] }) {
  return (
    <Table.ScrollContainer minWidth={980}>
      <Table striped highlightOnHover verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Beneficiario</Table.Th>
            <Table.Th>Activo o recurso</Table.Th>
            <Table.Th>Fecha deseada</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Atendida</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {solicitudes.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td ff="monospace">
                <Anchor component={Link} to={`/control-acceso/${s.id}`} fw={600}>
                  {s.codigoUnico}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <Badge size="sm" variant="light" color={TIPO_ACCESO[s.tipoAcceso].color}>
                    {TIPO_ACCESO[s.tipoAcceso].etiqueta}
                  </Badge>
                  <Badge size="sm" variant="outline" color={s.tipoSolicitud === 'BAJA' ? 'grape' : 'gray'}>
                    {TIPO_SOLICITUD[s.tipoSolicitud]}
                  </Badge>
                </Group>
              </Table.Td>
              <Table.Td>
                {s.nombreUsuarioBeneficiario}
                <Text size="xs" c="dimmed">
                  {s.departamento}
                </Text>
              </Table.Td>
              <Table.Td>
                {destino(s)}
                <Text size="xs" c="dimmed">
                  {s.activo ? s.activo.categoria : 'Recurso no inventariado'}
                </Text>
              </Table.Td>
              <Table.Td>
                {formatearFechaHora(s.fechaAccesoDeseada)}
                <div>
                  <Badge size="xs" variant="light" color={SITUACION[s.situacion].color}>
                    {SITUACION[s.situacion].etiqueta}
                  </Badge>
                </div>
              </Table.Td>
              <Table.Td>
                <Badge color={ESTADO[s.estado].color}>{ESTADO[s.estado].etiqueta}</Badge>
              </Table.Td>
              <Table.Td>{s.fechaAtendido ? formatearFechaHora(s.fechaAtendido) : '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
