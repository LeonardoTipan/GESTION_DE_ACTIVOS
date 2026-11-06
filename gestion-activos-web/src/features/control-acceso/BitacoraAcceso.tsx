import { Anchor, Badge, Button, Group, Modal, Select, Stack, Table, Text, Title } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BitacoraGeneral, SelectorAnioBitacora } from '../../shared/bitacora/BitacoraGeneral.tsx'
import { CampoBusqueda } from '../../shared/bitacora/CampoBusqueda.tsx'
import { TarjetaListado } from '../../shared/components/TarjetaListado.tsx'
import { formatearFechaHora, hoyLocal } from '../../shared/formato.ts'
import { useBitacoraEspecificaAcceso, useBitacoraGeneralAcceso, type EstadoSolicitud, type FilaBitacoraAcceso, type TipoAcceso, type TipoSolicitud } from './api.ts'
import { HistorialSolicitud } from './HistorialSolicitud.tsx'
import { destino, ESTADO, solicitante, TIPO_ACCESO, TIPO_SOLICITUD } from './textos.ts'

const EN_INDICADOR: Record<FilaBitacoraAcceso['enIndicador'], { etiqueta: string; color: string; ayuda: string }> = {
  OTORGADO: { etiqueta: 'Otorgado', color: 'green', ayuda: 'Alta cerrada: cuenta en «Accesos otorgados».' },
  PENDIENTE: { etiqueta: 'Pendiente', color: 'orange', ayuda: 'Alta sin atender: solo cuenta en el total de solicitudes.' },
  NO_APLICA: { etiqueta: 'Baja · aparte', color: 'gray', ayuda: 'Solicitud de baja: se informa aparte, fuera de la fórmula.' },
}
const opciones = <K extends string>(r: Record<K, { etiqueta: string }>) => (Object.keys(r) as K[]).map((k) => ({ value: k, label: r[k].etiqueta }))

function TablaBitacora({ filas, onHistorial }: { filas: FilaBitacoraAcceso[]; onHistorial: (f: FilaBitacoraAcceso) => void }) {
  return (
    <Table.ScrollContainer minWidth={1350}>
      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Personal</Table.Th>
            <Table.Th>Fecha de solicitud</Table.Th>
            <Table.Th>Activo de información</Table.Th>
            <Table.Th>Tipo de acceso</Table.Th>
            <Table.Th>Solicitud</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Fecha real de atención</Table.Th>
            <Table.Th>En el indicador</Table.Th>
            <Table.Th>Historial</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((s) => {
            const pide = solicitante(s)
            const ind = EN_INDICADOR[s.enIndicador]
            return (
              <Table.Tr key={s.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/control-acceso/${s.id}`} fw={600} ff="monospace">{s.codigoUnico}</Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>{s.nombreUsuarioBeneficiario}</Text>
                  <Text size="xs" c="dimmed">Solicita: {pide.nombre}</Text>
                </Table.Td>
                <Table.Td>{formatearFechaHora(s.fechaSolicitud)}</Table.Td>
                <Table.Td><Text size="sm" maw={220}>{destino(s)}</Text></Table.Td>
                <Table.Td><Badge variant="light" color={TIPO_ACCESO[s.tipoAcceso].color}>{TIPO_ACCESO[s.tipoAcceso].etiqueta}</Badge></Table.Td>
                <Table.Td><Badge variant="outline" color={TIPO_SOLICITUD[s.tipoSolicitud].color}>{TIPO_SOLICITUD[s.tipoSolicitud].corto}</Badge></Table.Td>
                <Table.Td><Badge variant="light" color={ESTADO[s.estado].color}>{ESTADO[s.estado].etiqueta}</Badge></Table.Td>
                <Table.Td>{s.fechaAtendido ? formatearFechaHora(s.fechaAtendido) : <Text size="sm" c="dimmed">Sin atender</Text>}</Table.Td>
                <Table.Td><Badge variant="light" color={ind.color} title={ind.ayuda}>{ind.etiqueta}</Badge></Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => onHistorial(s)}>
                    Ver
                  </Button>
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
 * Pestaña «Bitácora» de Control de acceso (solo consulta): la Bitácora General MENSUAL del Excel
 * (altas cerradas ÷ altas registradas; bajas aparte) y la Específica con las solicitudes del mes.
 */
export function BitacoraAcceso() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | undefined>()
  const [q, setQ] = useState<string | undefined>()
  const [estado, setEstado] = useState<EstadoSolicitud | undefined>()
  const [tipoAcceso, setTipoAcceso] = useState<TipoAcceso | undefined>()
  const [tipoSolicitud, setTipoSolicitud] = useState<TipoSolicitud | undefined>()
  const [page, setPage] = useState(1)
  const [historial, setHistorial] = useState<FilaBitacoraAcceso | null>(null)
  const general = useBitacoraGeneralAcceso(anio)
  const especifica = useBitacoraEspecificaAcceso({ anio, mes, q, estado, tipoAcceso, tipoSolicitud, page, limit: 20 })
  const con = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1) }
  const etiquetaMes = mes ? general.data?.periodos[mes - 1]?.etiqueta : undefined

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={con(setAnio)} />
        <Select
          label="Mes"
          placeholder="Año entero"
          clearable
          data={(general.data?.periodos ?? []).map((p, i) => ({ value: String(i + 1), label: p.etiqueta }))}
          value={mes ? String(mes) : null}
          onChange={(v) => con(setMes)(v ? Number(v) : undefined)}
          w={{ base: '100%', sm: 160 }}
        />
      </Group>
      <BitacoraGeneral consulta={general} seleccionado={mes} onSeleccionar={con(setMes)} />

      <div>
        <Title order={4}>Bitácora Específica · {etiquetaMes ? `${etiquetaMes} ${anio}` : `año ${anio}`}</Title>
        <Text size="sm" c="dimmed">
          Las solicitudes registradas en el período (por su fecha de solicitud) y cómo cuenta cada una. Para corregir una solicitud, ábrala:
          el cambio queda en su historial.
        </Text>
      </div>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <CampoBusqueda label="Buscar" placeholder="Código, persona, recurso o activo" valor={q} onCambio={con(setQ)} />
        <Select label="Tipo de acceso" placeholder="Todos" clearable data={opciones(TIPO_ACCESO)} value={tipoAcceso ?? null} onChange={(v) => con(setTipoAcceso)((v as TipoAcceso | null) ?? undefined)} w={{ base: '100%', sm: 150 }} />
        <Select label="Solicitud" placeholder="Todas" clearable data={opciones(TIPO_SOLICITUD)} value={tipoSolicitud ?? null} onChange={(v) => con(setTipoSolicitud)((v as TipoSolicitud | null) ?? undefined)} w={{ base: '100%', sm: 200 }} />
        <Select label="Estado" placeholder="Todos" clearable data={opciones(ESTADO)} value={estado ?? null} onChange={(v) => con(setEstado)((v as EstadoSolicitud | null) ?? undefined)} w={{ base: '100%', sm: 150 }} />
      </Group>
      <TarjetaListado
        consulta={especifica}
        pagina={page}
        onPagina={setPage}
        tituloError="No se pudo cargar la Bitácora Específica"
        vacio={<Text c="dimmed">No hay solicitudes en este período con esos filtros.</Text>}
      >
        {(filas) => <TablaBitacora filas={filas} onHistorial={setHistorial} />}
      </TarjetaListado>
      <Modal opened={historial !== null} onClose={() => setHistorial(null)} title={historial ? `Historial de ${historial.codigoUnico}` : ''} size="xl">
        {historial && <HistorialSolicitud id={historial.id} />}
      </Modal>
    </Stack>
  )
}
