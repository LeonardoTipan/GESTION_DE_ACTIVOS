import { Alert, Anchor, Button, Card, Group, Modal, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCircleCheck, IconDeviceFloppy, IconEdit, IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { errorRepositorio } from '../../../shared/evidencia.ts'
import { ahoraLocal, fechaHoraLocalAIso, formatearFechaHora, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoMotivoCambio } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { instante } from '../../../shared/zona.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../auth/use-puede.ts'
import {
  useActualizarRemediacion,
  useIniciarRemediacion,
  useReabrir,
  useRemediar,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { accionesPermitidas, faltantesParaRemediar } from '../riesgo.ts'
import { BadgeEstado, BadgeSla } from './Badges.tsx'

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

/** Repositorio: si es una URL http(s), enlace; si es una carpeta, texto (no se expone nada más). */
function Repositorio({ valor }: { valor: string | null }) {
  if (!valor) return <>—</>
  return /^https?:\/\//i.test(valor) ? (
    <Anchor href={valor} target="_blank" rel="noopener noreferrer" size="sm">
      {valor}
    </Anchor>
  ) : (
    <>{valor}</>
  )
}

const aviso = (titulo: string, mensaje: string) => notifications.show({ color: 'green', title: titulo, message: mensaje })
const fallo = (titulo: string) => (e: Error) => notifications.show({ color: 'red', title: titulo, message: e.message })

/** ABIERTO → EN_PROGRESO, con el inicio real opcional. */
function IniciarModal({ v, opened, onClose }: { v: Vulnerabilidad; opened: boolean; onClose: () => void }) {
  const iniciar = useIniciarRemediacion()
  const [inicio, setInicio] = useState<string | null>(null)
  return (
    <Modal opened={opened} onClose={onClose} title="Iniciar la remediación">
      <Stack gap="sm">
        <Text size="sm">La vulnerabilidad pasará a <b>En progreso</b>.</Text>
        <DateTimePicker
          label="Inicio real del trabajo"
          description="Opcional. No puede ser futuro ni anterior a la detección."
          valueFormat="DD MMM YYYY HH:mm"
          clearable
          maxDate={ahoraLocal()}
          minDate={isoAFechaHoraLocal(v.fecha)}
          value={inicio}
          onChange={setInicio}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button
            color="yellow"
            loading={iniciar.isPending}
            onClick={() =>
              iniciar.mutate(
                { id: v.id, datos: inicio ? { fechaInicio: fechaHoraLocalAIso(inicio) } : {} },
                {
                  onSuccess: () => {
                    aviso('Remediación en progreso', 'Registre la fecha real, el verificable y su repositorio para remediarla.')
                    onClose()
                  },
                  onError: fallo('No se pudo iniciar'),
                },
              )
            }
          >
            Iniciar
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** REMEDIADO → EN_PROGRESO con motivo (la fecha anterior queda en la auditoría). */
function ReabrirModal({ v, opened, onClose }: { v: Vulnerabilidad; opened: boolean; onClose: () => void }) {
  const reabrir = useReabrir()
  const form = useForm({ initialValues: { motivo: '' }, validate: { motivo: errorMotivo } })
  return (
    <Modal opened={opened} onClose={onClose} title="Reabrir la vulnerabilidad">
      <form
        onSubmit={form.onSubmit(({ motivo }) =>
          reabrir.mutate(
            { id: v.id, motivo: motivo.trim() },
            {
              onSuccess: () => {
                aviso('Vulnerabilidad reabierta', 'Vuelve a En progreso; la remediación anterior queda en la auditoría.')
                form.reset()
                onClose()
              },
              onError: fallo('No se pudo reabrir'),
            },
          ),
        )}
      >
        <Stack gap="sm">
          <Text size="sm">
            Vuelve a <b>En progreso</b>. La fecha de remediación vigente se vacía; la anterior, con quién la registró, se
            conserva en la auditoría.
          </Text>
          <Textarea label="Motivo" withAsterisk autosize minRows={2} placeholder="El escaneo vuelve a detectar la versión vulnerable." {...form.getInputProps('motivo')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Volver
            </Button>
            <Button type="submit" color="orange" loading={reabrir.isPending}>
              Reabrir
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

interface Valores {
  fechaRemediacion: string | null
  evidencia: string
  repositorioVerificable: string
  observacion: string
  motivoCambio: string
}

/**
 * Formulario de remediación. Pendiente: guardar sin cerrar o marcar como remediada
 * (exige fecha real, verificable y repositorio). Remediada: corrección (solo admin, con motivo).
 */
function FormRemediacion({ v, correccion, onListo }: { v: Vulnerabilidad; correccion: boolean; onListo?: () => void }) {
  const actualizar = useActualizarRemediacion()
  const remediar = useRemediar()
  const deteccion = isoAFechaHoraLocal(v.fecha)
  const form = useForm<Valores>({
    initialValues: {
      fechaRemediacion: v.fechaRemediacion ? isoAFechaHoraLocal(v.fechaRemediacion) : null,
      evidencia: v.evidencia ?? '',
      repositorioVerificable: v.repositorioVerificable ?? '',
      observacion: v.observacion ?? '',
      motivoCambio: '',
    },
    validate: {
      fechaRemediacion: (f) => (f && instante(f).isBefore(instante(deteccion)) ? 'No puede ser anterior a la detección' : null),
      evidencia: (e) => (e.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      repositorioVerificable: errorRepositorio,
      observacion: (o) => (o.trim().length > 5000 ? 'Máximo 5000 caracteres' : null),
      motivoCambio: (m) => (correccion ? errorMotivo(m) : null),
    },
  })
  const datos = (x: Valores) => ({
    fechaRemediacion: x.fechaRemediacion ? fechaHoraLocalAIso(x.fechaRemediacion) : undefined,
    evidencia: x.evidencia.trim() || undefined,
    repositorioVerificable: x.repositorioVerificable.trim() || undefined,
    observacion: x.observacion.trim() || undefined,
  })

  const guardar = form.onSubmit((x) =>
    actualizar.mutate(
      { id: v.id, datos: { ...datos(x), motivoCambio: correccion ? x.motivoCambio.trim() : undefined } },
      {
        onSuccess: () => {
          aviso(correccion ? 'Remediación corregida' : 'Datos guardados', correccion ? 'El cambio queda en la auditoría.' : 'El estado no cambia hasta marcarla como remediada.')
          form.resetDirty()
          onListo?.()
        },
        onError: fallo('No se pudo guardar'),
      },
    ),
  )

  const marcarRemediada = () => {
    if (form.validate().hasErrors) return
    const x = form.getValues()
    const faltan = faltantesParaRemediar(x)
    if (faltan.length) {
      form.setErrors({
        ...(x.fechaRemediacion ? {} : { fechaRemediacion: 'Obligatoria para remediar' }),
        ...(x.evidencia.trim() ? {} : { evidencia: 'Obligatorio para remediar' }),
        ...(x.repositorioVerificable.trim() ? {} : { repositorioVerificable: 'Obligatorio para remediar' }),
      })
      notifications.show({ color: 'orange', title: 'No se puede remediar todavía', message: `Falta ${faltan.join(', ')}.` })
      return
    }
    const d = datos(x)
    remediar.mutate(
      { id: v.id, datos: { ...d, fechaRemediacion: d.fechaRemediacion!, evidencia: d.evidencia!, repositorioVerificable: d.repositorioVerificable! } },
      { onSuccess: () => aviso('Vulnerabilidad remediada', 'Con la fecha real indicada y su evidencia.'), onError: fallo('No se pudo remediar') },
    )
  }

  return (
    <form onSubmit={guardar} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Fecha de remediación"
            description="Cuándo se solucionó REALMENTE (puede ser anterior a hoy; no futura)"
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            clearable
            maxDate={ahoraLocal()}
            minDate={deteccion}
            {...form.getInputProps('fechaRemediacion')}
          />
          <TextInput
            label="Verificable"
            description="Informe o documento que prueba la remediación"
            placeholder="Informe de Mitigación de Amenazas y Vulnerabilidades 01"
            {...form.getInputProps('evidencia')}
          />
        </SimpleGrid>
        <TextInput
          label="Repositorio verificable"
          description="Carpeta compartida o URL http(s) donde está la evidencia (la aplicación no guarda archivos)"
          placeholder="Carpeta Compartida TICs/Vulnerabilidades/2026"
          {...form.getInputProps('repositorioVerificable')}
        />
        <Textarea
          label="Observación"
          description="Acciones realizadas, detalles técnicos, limitaciones"
          autosize
          minRows={2}
          {...form.getInputProps('observacion')}
        />
        {correccion && <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />}
        <Group justify="flex-end">
          <Button type="submit" variant={correccion ? 'filled' : 'default'} leftSection={<IconDeviceFloppy size={16} />} loading={actualizar.isPending} disabled={!form.isDirty()}>
            {correccion ? 'Guardar corrección' : 'Guardar sin cerrar'}
          </Button>
          {!correccion && (
            <Button color="green" leftSection={<IconCircleCheck size={16} />} loading={remediar.isPending} onClick={marcarRemediada}>
              Marcar como remediada
            </Button>
          )}
        </Group>
      </Stack>
    </form>
  )
}

/** Fase 2 · Remediación de la vulnerabilidad (el mismo registro que la detección). */
export function Remediacion({ v }: { v: Vulnerabilidad }) {
  const puedeOperar = usePuedeOperar()
  const esAdmin = usePuedeAdministrar()
  const [iniciando, inicio] = useDisclosure()
  const [reabriendo, reapertura] = useDisclosure()
  const [corrigiendo, setCorrigiendo] = useState(false)
  const anulada = v.anuladoEn !== null
  const acciones = anulada || !puedeOperar ? [] : accionesPermitidas(v.estado)
  const remediada = v.estado === 'REMEDIADO'

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Group gap="sm">
          <Title order={4}>2 · Remediación</Title>
          <BadgeEstado estado={v.estado} />
          {v.fechaLimite && <BadgeSla vulnerabilidad={v} />}
        </Group>
        <Group gap="sm">
          {acciones.includes('iniciar') && (
            <Button color="yellow" leftSection={<IconPlayerPlay size={16} />} onClick={inicio.open}>
              Iniciar remediación
            </Button>
          )}
          {acciones.includes('reabrir') && (
            <Button color="orange" variant="light" leftSection={<IconRotateClockwise size={16} />} onClick={reapertura.open}>
              Reabrir
            </Button>
          )}
          {remediada && esAdmin && !anulada && !corrigiendo && (
            <Button variant="light" leftSection={<IconEdit size={16} />} onClick={() => setCorrigiendo(true)}>
              Corregir remediación
            </Button>
          )}
        </Group>
      </Group>

      {v.tratamientoIniciadoEn && (
        <Text size="sm" c="dimmed" mb="sm">
          Remediación iniciada: {formatearFechaHora(v.tratamientoIniciadoEn)}
        </Text>
      )}

      {remediada && !corrigiendo ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Dato etiqueta="Fecha de remediación (real)">{formatearFechaHora(v.fechaRemediacion)}</Dato>
            <Dato etiqueta="Verificable">{v.evidencia ?? '—'}</Dato>
            <Dato etiqueta="Repositorio verificable">
              <Repositorio valor={v.repositorioVerificable} />
            </Dato>
          </SimpleGrid>
          <Dato etiqueta="Observación">{v.observacion ?? '—'}</Dato>
          <Text size="xs" c="dimmed">
            Remediación registrada por {v.cerradaPor ?? '—'}. La verificación de la evidencia se hizo al cerrarla: no hay
            una fase de verificación aparte.
          </Text>
        </Stack>
      ) : acciones.includes('remediar') || corrigiendo ? (
        <>
          {!corrigiendo && (
            <Alert color="blue" variant="light" mb="sm">
              Para marcarla como remediada se exigen la <b>fecha real</b> de remediación, el <b>verificable</b> y su
              <b> repositorio</b>. Puede guardarlos antes sin cerrarla.
            </Alert>
          )}
          <FormRemediacion v={v} correccion={corrigiendo} onListo={() => setCorrigiendo(false)} />
          {corrigiendo && (
            <Button variant="subtle" mt="xs" onClick={() => setCorrigiendo(false)}>
              Cancelar la corrección
            </Button>
          )}
        </>
      ) : (
        // Solo lectura (auditor, anulada) o pendiente sin datos.
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Dato etiqueta="Fecha de remediación">{v.fechaRemediacion ? formatearFechaHora(v.fechaRemediacion) : 'No remediada'}</Dato>
          <Dato etiqueta="Verificable">{v.evidencia ?? '—'}</Dato>
          <Dato etiqueta="Repositorio verificable">
            <Repositorio valor={v.repositorioVerificable} />
          </Dato>
          <Dato etiqueta="Observación">{v.observacion ?? '—'}</Dato>
        </SimpleGrid>
      )}

      <IniciarModal v={v} opened={iniciando} onClose={inicio.close} />
      <ReabrirModal v={v} opened={reabriendo} onClose={reapertura.close} />
    </Card>
  )
}
