import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Table, Text, Textarea, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconArrowBackUp, IconCheck, IconHourglass, IconPencil } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { formatearFechaHora } from '../../shared/formato.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../auth/use-puede.ts'
import {
  useCerrarSolicitud,
  useHistorial,
  usePasarAPendiente,
  useReabrirSolicitud,
  useSolicitud,
  type Solicitud,
} from './api.ts'
import { SolicitudFormModal } from './SolicitudFormModal.tsx'
import { ESTADO, nombreCampo, SITUACION, TIPO_ACCESO, TIPO_SOLICITUD, valorLegible } from './textos.ts'

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text component="div" size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {children}
      </Text>
    </div>
  )
}

const aviso = (titulo: string, cerrar?: () => void) => ({
  onSuccess: (s: Solicitud) => {
    notifications.show({ color: 'green', title: titulo, message: `${s.codigoUnico} · queda en el historial.` })
    cerrar?.()
  },
  onError: (e: Error) => notifications.show({ color: 'red', title: 'No se pudo completar', message: e.message }),
})

/** Texto obligatorio con mínimo: resolución al cerrar, motivo al reabrir. */
function TextoModal({
  abierto,
  onCerrar,
  titulo,
  explicacion,
  etiqueta,
  minimo,
  boton,
  color,
  enviando,
  onConfirmar,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  explicacion: string
  etiqueta: string
  minimo: number
  boton: string
  color: string
  enviando: boolean
  onConfirmar: (texto: string) => void
}) {
  const [texto, setTexto] = useState('')
  const [tocado, setTocado] = useState(false)
  const error = texto.trim().length < minimo ? `Mínimo ${minimo} caracteres.` : null
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTocado(true)
          if (!error) onConfirmar(texto.trim())
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {explicacion}
          </Text>
          <Textarea label={etiqueta} withAsterisk autosize minRows={3} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} error={tocado ? error : null} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCerrar}>
              Volver
            </Button>
            <Button type="submit" color={color} loading={enviando}>
              {boton}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function ControlAccesoDetallePage() {
  const id = Number(useParams().id)
  const { data: s, isPending, error } = useSolicitud(id)
  const historial = useHistorial(id)
  const puedeOperar = usePuedeOperar()
  const admin = usePuedeAdministrar()
  const pendiente = usePasarAPendiente()
  const cerrar = useCerrarSolicitud()
  const reabrir = useReabrirSolicitud()
  const [editando, edicion] = useDisclosure()
  const [cerrando, cierre] = useDisclosure()
  const [reabriendo, reapertura] = useDisclosure()

  const migas = (
    <Breadcrumbs>
      <Anchor component={Link} to="/control-acceso">
        Control de acceso
      </Anchor>
      <Text>{s?.codigoUnico ?? `#${id}`}</Text>
    </Breadcrumbs>
  )
  if (isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }
  if (error || !s) {
    return (
      <Stack gap="md">
        {migas}
        <Alert color="orange" title="Solicitud no disponible" maw={560}>
          {error?.message ?? 'La solicitud no existe.'}
        </Alert>
      </Stack>
    )
  }

  const cerrada = s.estado === 'CERRADO'
  const baja = s.tipoSolicitud === 'BAJA'

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2} ff="monospace">
              {s.codigoUnico}
            </Title>
            <Badge variant="light" color={TIPO_ACCESO[s.tipoAcceso].color}>
              Acceso {TIPO_ACCESO[s.tipoAcceso].etiqueta.toLowerCase()}
            </Badge>
            <Badge variant="outline" color={baja ? 'grape' : 'gray'}>
              {TIPO_SOLICITUD[s.tipoSolicitud]}
            </Badge>
            <Badge color={ESTADO[s.estado].color}>{ESTADO[s.estado].etiqueta}</Badge>
            <Badge variant="light" color={SITUACION[s.situacion].color}>
              {SITUACION[s.situacion].etiqueta}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {s.nombreUsuarioBeneficiario} · {s.departamento}
          </Text>
        </div>
        <Group gap="sm">
          {puedeOperar && !cerrada && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Modificar
            </Button>
          )}
          {puedeOperar && s.estado === 'ABIERTO' && (
            <Button color="yellow" variant="light" leftSection={<IconHourglass size={16} />} loading={pendiente.isPending} onClick={() => pendiente.mutate(s.id, aviso('Solicitud en gestión'))}>
              Pasar a pendiente
            </Button>
          )}
          {puedeOperar && !cerrada && (
            <Button color="green" leftSection={<IconCheck size={16} />} onClick={cierre.open}>
              Cerrar
            </Button>
          )}
          {admin && cerrada && (
            <Button color="orange" variant="light" leftSection={<IconArrowBackUp size={16} />} onClick={reapertura.open}>
              Reabrir
            </Button>
          )}
        </Group>
      </Group>

      {s.situacion === 'VENCIDA' && (
        <Alert color="red" title="Fecha deseada vencida" maw={720}>
          La fecha deseada ({formatearFechaHora(s.fechaAccesoDeseada)}) ya pasó y la solicitud sigue {ESTADO[s.estado].etiqueta.toLowerCase()}.
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Dato etiqueta={s.activo ? 'Activo inventariado' : 'Recurso no inventariado'}>
              {s.activo ? (
                <>
                  <Anchor component={Link} to={`/activos/${s.activo.id}`}>
                    {s.activo.codigo} · {s.activo.nombre}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {s.activo.categoria}
                    {s.activo.tipo ? ` · ${s.activo.tipo}` : ''}
                  </Text>
                </>
              ) : (
                s.recurso
              )}
            </Dato>
            <Dato etiqueta="Descripción o motivo">{s.descripcion}</Dato>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Dato etiqueta="Solicitada">{formatearFechaHora(s.fechaSolicitud)}</Dato>
            <Dato etiqueta="Fecha deseada">{formatearFechaHora(s.fechaAccesoDeseada)}</Dato>
            <Dato etiqueta="Registrada">{formatearFechaHora(s.fechaCreacion)}</Dato>
            <Dato etiqueta="Atendida">{s.fechaAtendido ? formatearFechaHora(s.fechaAtendido) : '—'}</Dato>
          </SimpleGrid>
          {s.resolucion && (
            <Alert color="green" title={baja ? 'Resolución: acceso retirado' : 'Resolución: acceso otorgado'}>
              {s.resolucion}
            </Alert>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Title order={4} mb="sm">
          Historial de cambios
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Lo escribe el sistema en la misma operación que cada cambio, con el usuario de la sesión. No se puede modificar ni borrar.
        </Text>
        {historial.isPending ? (
          <Loader size="sm" />
        ) : historial.error ? (
          <Alert color="red">{historial.error.message}</Alert>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="xs" fz="sm" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Campo</Table.Th>
                  <Table.Th>Antes</Table.Th>
                  <Table.Th>Después</Table.Th>
                  <Table.Th>Motivo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {historial.data.map((h) => (
                  <Table.Tr key={h.id}>
                    <Table.Td>{formatearFechaHora(h.fecha)}</Table.Td>
                    <Table.Td>{h.usuario}</Table.Td>
                    <Table.Td fw={500}>{nombreCampo(h.campo)}</Table.Td>
                    <Table.Td c="dimmed" maw={220}>
                      {h.campo === 'CREACION' ? '—' : valorLegible(h.campo, h.valorAnterior)}
                    </Table.Td>
                    <Table.Td maw={220}>{valorLegible(h.campo, h.valorNuevo)}</Table.Td>
                    <Table.Td maw={240}>{h.motivo ?? '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <SolicitudFormModal abierto={editando} onCerrar={edicion.close} solicitud={s} />
      <TextoModal
        abierto={cerrando}
        onCerrar={cierre.close}
        titulo={`Cerrar ${s.codigoUnico}`}
        explicacion={
          baja
            ? 'Describa cómo se retiró el acceso. La fecha de atención será la de ahora (la pone el sistema).'
            : 'Describa cómo se otorgó el acceso. La fecha de atención será la de ahora (la pone el sistema).'
        }
        etiqueta="Resolución"
        minimo={10}
        boton="Cerrar solicitud"
        color="green"
        enviando={cerrar.isPending}
        onConfirmar={(resolucion) => cerrar.mutate({ id: s.id, resolucion }, aviso('Solicitud cerrada', cierre.close))}
      />
      <TextoModal
        abierto={reabriendo}
        onCerrar={reapertura.close}
        titulo={`Reabrir ${s.codigoUnico}`}
        explicacion="Vuelve a «Pendiente». La atención anterior (fecha y resolución) queda en el historial."
        etiqueta="Motivo de la reapertura"
        minimo={20}
        boton="Reabrir"
        color="orange"
        enviando={reabrir.isPending}
        onConfirmar={(motivo) => reabrir.mutate({ id: s.id, motivo }, aviso('Solicitud reabierta', reapertura.close))}
      />
    </Stack>
  )
}
