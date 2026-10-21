import { Alert, Anchor, Badge, Breadcrumbs, Button, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Table, Text, Textarea, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconArrowBackUp, IconCheck, IconHourglass, IconPencil } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ahoraLocal, fechaHoraLocalAIso, formatearFechaHora, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { instante } from '../../shared/zona.ts'
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
import { atencionesAnteriores, ESTADO, nombreCampo, solicitante, TIPO_ACCESO, TIPO_SOLICITUD, valorLegible } from './textos.ts'

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

/** Motivo obligatorio con mínimo (reabrir). */
function MotivoModal({
  abierto,
  onCerrar,
  titulo,
  explicacion,
  enviando,
  onConfirmar,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  explicacion: string
  enviando: boolean
  onConfirmar: (motivo: string) => void
}) {
  const [texto, setTexto] = useState('')
  const [tocado, setTocado] = useState(false)
  const error = texto.trim().length < 20 ? 'Mínimo 20 caracteres.' : null
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
          <Textarea label="Motivo de la reapertura" withAsterisk autosize minRows={3} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} error={tocado ? error : null} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCerrar}>
              Volver
            </Button>
            <Button type="submit" color="orange" loading={enviando}>
              Reabrir
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/**
 * Cerrar: la fecha y hora REALES de la atención las indica quien cierra (puede
 * ser una fecha histórica); no se rellena con la hora actual.
 */
function CerrarModal({ abierto, onCerrar, solicitud: s }: { abierto: boolean; onCerrar: () => void; solicitud: Solicitud }) {
  const cerrar = useCerrarSolicitud()
  const [fecha, setFecha] = useState<string | null>(null)
  const [resolucion, setResolucion] = useState('')
  const [tocado, setTocado] = useState(false)
  const baja = s.tipoSolicitud === 'BAJA'
  const errorFecha = !fecha
    ? 'Indique la fecha y hora en que se atendió.'
    : instante(fecha).isAfter(instante(ahoraLocal()).add(5, 'minute'))
      ? 'No puede ser futura.'
      : instante(fecha).isBefore(instante(s.fechaSolicitud))
        ? 'No puede ser anterior a la fecha de solicitud.'
        : null
  const errorResolucion = resolucion.trim().length < 10 ? 'Mínimo 10 caracteres.' : null
  return (
    <Modal opened={abierto} onClose={onCerrar} title={`Cerrar ${s.codigoUnico}`} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTocado(true)
          if (errorFecha || errorResolucion) return
          cerrar.mutate({ id: s.id, datos: { fechaAtendido: fechaHoraLocalAIso(fecha!), resolucion: resolucion.trim() } }, aviso('Solicitud cerrada', onCerrar))
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {baja
              ? 'Desvinculación de acceso (BAJA): describa cómo se retiró el acceso. El activo no se modifica.'
              : 'Otorgamiento de acceso (ALTA): describa cómo se otorgó el acceso.'}
          </Text>
          <DateTimePicker
            label="Fecha atendida"
            description={`Fecha y hora reales de la atención; puede ser anterior al registro. Solicitada el ${formatearFechaHora(s.fechaSolicitud)}.`}
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            minDate={isoAFechaHoraLocal(s.fechaSolicitud)}
            maxDate={ahoraLocal()}
            value={fecha}
            onChange={setFecha}
            error={tocado ? errorFecha : null}
          />
          <Textarea label="Resolución" withAsterisk autosize minRows={3} value={resolucion} onChange={(e) => setResolucion(e.currentTarget.value)} error={tocado ? errorResolucion : null} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCerrar}>
              Volver
            </Button>
            <Button type="submit" color="green" loading={cerrar.isPending || cerrar.isSuccess}>
              Cerrar solicitud
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
  const quien = solicitante(s)
  const anteriores = atencionesAnteriores(historial.data ?? [])

  return (
    <Stack gap="lg">
      {migas}
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2} ff="monospace">
              {s.codigoUnico}
            </Title>
            <Badge variant="filled" color={TIPO_SOLICITUD[s.tipoSolicitud].color}>
              {TIPO_SOLICITUD[s.tipoSolicitud].corto} · {TIPO_SOLICITUD[s.tipoSolicitud].etiqueta}
            </Badge>
            <Badge variant="light" color={TIPO_ACCESO[s.tipoAcceso].color}>
              Acceso {TIPO_ACCESO[s.tipoAcceso].etiqueta.toLowerCase()}
            </Badge>
            <Badge color={ESTADO[s.estado].color}>{ESTADO[s.estado].etiqueta}</Badge>
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {baja ? 'Pierde el acceso' : 'Recibe el acceso'}: {s.nombreUsuarioBeneficiario} · {s.departamento}
          </Text>
        </div>
        <Group gap="sm">
          {puedeOperar && !cerrada && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Modificar
            </Button>
          )}
          {admin && cerrada && (
            <Button variant="light" leftSection={<IconPencil size={16} />} onClick={edicion.open}>
              Corregir
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

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder padding="lg">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
            Solicitante · quien pide o autoriza
          </Text>
          <Text fw={600} c={s.nombreSolicitante ? undefined : 'dimmed'} fs={s.nombreSolicitante ? undefined : 'italic'}>
            {quien.nombre}
          </Text>
          <Text size="sm" c="dimmed">
            {quien.cargo ?? (s.nombreSolicitante ? '—' : 'Solicitud registrada antes de existir este dato')}
          </Text>
        </Card>
        <Card withBorder padding="lg">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
            Beneficiario · {baja ? 'quien pierde el acceso' : 'quien recibe el acceso'}
          </Text>
          <Text fw={600}>{s.nombreUsuarioBeneficiario}</Text>
          <Text size="sm" c="dimmed">
            {s.departamento}
          </Text>
        </Card>
      </SimpleGrid>

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
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Fecha de solicitud">{formatearFechaHora(s.fechaSolicitud)}</Dato>
            <Dato etiqueta="Fecha atendida">{s.fechaAtendido ? formatearFechaHora(s.fechaAtendido) : 'Sin atender'}</Dato>
            <Dato etiqueta="Registrada en el sistema">{formatearFechaHora(s.fechaCreacion)}</Dato>
          </SimpleGrid>
          {s.resolucion && (
            <Alert color={baja ? 'red' : 'green'} title={baja ? 'Resolución: acceso retirado (BAJA)' : 'Resolución: acceso otorgado (ALTA)'}>
              {s.resolucion}
            </Alert>
          )}
          {baja && (
            <Text size="xs" c="dimmed">
              Una desvinculación retira el acceso de la persona; no da de baja ni modifica el activo en el inventario ni en GLPI.
            </Text>
          )}
        </Stack>
      </Card>

      {anteriores.length > 0 && (
        <Card withBorder padding="lg">
          <Title order={4} mb="sm">
            Atenciones anteriores
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            La solicitud se reabrió: estas atenciones se conservan del historial.
          </Text>
          <Stack gap="xs">
            {anteriores.map((a) => (
              <Alert key={`${a.reabiertaEl}-${a.fechaAtendido}`} color="gray" title={`Atendida el ${formatearFechaHora(a.fechaAtendido)}`}>
                <Text size="sm">{a.resolucion ?? '—'}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Reabierta el {formatearFechaHora(a.reabiertaEl)} por {a.reabiertaPor}
                  {a.motivo ? `: ${a.motivo}` : ''}
                </Text>
              </Alert>
            ))}
          </Stack>
        </Card>
      )}

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
      <CerrarModal abierto={cerrando} onCerrar={cierre.close} solicitud={s} />
      <MotivoModal
        abierto={reabriendo}
        onCerrar={reapertura.close}
        titulo={`Reabrir ${s.codigoUnico}`}
        explicacion="Vuelve a «Pendiente» y queda sin fecha atendida ni resolución. La atención anterior no se pierde: se conserva en el historial y se muestra en «Atenciones anteriores»."
        enviando={reabrir.isPending}
        onConfirmar={(motivo) => reabrir.mutate({ id: s.id, motivo }, aviso('Solicitud reabierta', reapertura.close))}
      />
    </Stack>
  )
}
