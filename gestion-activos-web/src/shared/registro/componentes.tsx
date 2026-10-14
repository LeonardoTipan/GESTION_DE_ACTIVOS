import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  type TextareaProps,
  Timeline,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { IconArchive, IconArrowBackUp, IconHistory, IconPencil } from '@tabler/icons-react'
import { useState } from 'react'
import { api } from '../../api/client.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../features/auth/use-puede.ts'
import { ejecutar } from '../api/errores.ts'
import { formatearFechaHora } from '../formato.ts'
import {
  ASPECTO_INDICADOR,
  errorMotivo,
  estadoRegistro,
  metaIndicador,
  periodosDisponibles,
  valorIndicador,
  type EntidadTraza,
  type Indicador,
  type Periodo,
  type Registro,
} from './registro.ts'

// ── Indicadores (franja de tarjetas del prototipo) ──────────────────────────

export function TarjetaIndicador({ indicador: i }: { indicador: Indicador }) {
  const aspecto = ASPECTO_INDICADOR[i.estado]
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Text size="xs" fw={600} lh={1.3}>
          {i.nombre}
        </Text>
        <Tooltip label="Control del Anexo A de ISO/IEC 27001:2022">
          <Badge size="xs" variant="outline" style={{ flexShrink: 0 }}>
            {i.control}
          </Badge>
        </Tooltip>
      </Group>
      <Text fz={26} fw={700} mt={4}>
        {valorIndicador(i)}
      </Text>
      <Progress value={i.progreso} color={aspecto.color} size="sm" mt={4} />
      <Group justify="space-between" mt={6} gap={4}>
        <Text size="xs" c="dimmed">
          {metaIndicador(i)}
        </Text>
        <Badge size="xs" color={aspecto.color} variant="light">
          {aspecto.etiqueta}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mt={6} lh={1.35}>
        {i.formula}
      </Text>
      {i.hallazgo && (
        <Text size="xs" c={aspecto.color} mt={4} lh={1.35}>
          {i.hallazgo}
        </Text>
      )}
    </Card>
  )
}

export function FranjaIndicadores({
  indicadores,
  cargando,
  error,
}: {
  indicadores?: Indicador[]
  cargando: boolean
  error?: Error | null
}) {
  if (cargando) {
    return (
      <Center py="md">
        <Loader size="sm" />
      </Center>
    )
  }
  if (error) {
    return (
      <Alert color="red" title="No se pudieron calcular los indicadores">
        {error.message}
      </Alert>
    )
  }
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="sm">
      {(indicadores ?? []).map((i) => (
        <TarjetaIndicador key={i.id} indicador={i} />
      ))}
    </SimpleGrid>
  )
}

export function SelectorPeriodo({
  periodo,
  onChange,
}: {
  periodo: Periodo
  onChange: (id: string) => void
}) {
  return (
    <Select
      label="Período de evaluación"
      data={periodosDisponibles().map((p) => ({ value: p.id, label: p.etiqueta }))}
      value={periodo.id}
      onChange={(v) => v && onChange(v)}
      allowDeselect={false}
      w={{ base: '100%', sm: 220 }}
    />
  )
}

// ── Estado del registro y acciones ──────────────────────────────────────────

export function BadgeRegistro({ registro }: { registro: Registro }) {
  const { etiqueta, color } = estadoRegistro(registro)
  const badge = (
    <Badge size="sm" color={color} variant={registro.anuladoEn ? 'filled' : 'light'}>
      {etiqueta}
    </Badge>
  )
  return registro.anuladoEn ? (
    <Tooltip
      multiline
      w={280}
      label={`Anulado por ${registro.anuladoPor ?? '—'} el ${formatearFechaHora(registro.anuladoEn)}. Motivo: ${registro.motivoAnulacion ?? '—'}`}
    >
      {badge}
    </Tooltip>
  ) : (
    badge
  )
}

/** Aviso destacado en la ficha de un registro anulado. */
export function AvisoAnulado({ registro }: { registro: Registro }) {
  if (!registro.anuladoEn) return null
  return (
    <Alert color="red" icon={<IconArchive />} title="Registro anulado — eliminación lógica">
      Anulado por <b>{registro.anuladoPor}</b> el {formatearFechaHora(registro.anuladoEn)}. Motivo:{' '}
      {registro.motivoAnulacion}. Se conserva para auditoría y no cuenta en los indicadores.
    </Alert>
  )
}

/**
 * Botones de la fila: Modificar (admin, analista), Anular / Revertir (admin) y
 * Trazas (todos). El auditor solo ve Trazas.
 */
export function AccionesRegistro({
  registro,
  onModificar,
  onAnular,
  onReversar,
  onTrazas,
}: {
  registro: Registro
  onModificar?: () => void
  onAnular: () => void
  onReversar: () => void
  onTrazas: () => void
}) {
  const puedeOperar = usePuedeOperar()
  const puedeAnular = usePuedeAdministrar()
  const anulado = registro.anuladoEn !== null
  return (
    <Group gap={4} wrap="nowrap">
      {onModificar && !anulado && puedeOperar && (
        <Button size="compact-xs" variant="light" leftSection={<IconPencil size={12} />} onClick={onModificar}>
          Modificar
        </Button>
      )}
      {!anulado && puedeAnular && (
        <Button size="compact-xs" variant="light" color="red" leftSection={<IconArchive size={12} />} onClick={onAnular}>
          Anular
        </Button>
      )}
      {anulado && puedeAnular && (
        <Button size="compact-xs" variant="light" leftSection={<IconArrowBackUp size={12} />} onClick={onReversar}>
          Revertir
        </Button>
      )}
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconHistory size={12} />} onClick={onTrazas}>
        Trazas
      </Button>
    </Group>
  )
}

/**
 * En la ficha de un registro: su versión, Anular / Revertir (solo admin) y
 * Trazas (todos), con sus modales.
 */
export function ControlRegistro({
  registro,
  entidad,
  registroId,
  nombre,
  etiquetas,
  enviando,
  onAnulacion,
}: {
  registro: Registro
  entidad: EntidadTraza
  registroId: number
  /** "el mantenimiento #12" */
  nombre: string
  etiquetas: Record<string, string>
  enviando: boolean
  /** Llama a la API; `listo` cierra el modal tras el éxito. */
  onAnulacion: (modo: ModoMotivo, motivo: string, listo: () => void) => void
}) {
  const puedeAnular = usePuedeAdministrar()
  const [modo, setModo] = useState<ModoMotivo | null>(null)
  const [verTrazas, setVerTrazas] = useState(false)
  const anulado = registro.anuladoEn !== null
  return (
    <>
      <BadgeRegistro registro={registro} />
      {puedeAnular && (
        <Button
          variant="light"
          color={anulado ? 'blue' : 'red'}
          leftSection={anulado ? <IconArrowBackUp size={16} /> : <IconArchive size={16} />}
          onClick={() => setModo(anulado ? 'reversar' : 'anular')}
        >
          {anulado ? 'Revertir anulación' : 'Anular'}
        </Button>
      )}
      <Button variant="subtle" color="gray" leftSection={<IconHistory size={16} />} onClick={() => setVerTrazas(true)}>
        Trazas
      </Button>
      <MotivoModal
        abierto={modo !== null}
        modo={modo ?? 'anular'}
        titulo={modo === 'reversar' ? `Revertir la anulación de ${nombre}` : `Anular ${nombre}`}
        enviando={enviando}
        onCerrar={() => setModo(null)}
        onConfirmar={(motivo) => modo && onAnulacion(modo, motivo, () => setModo(null))}
      />
      <TrazasModal
        abierto={verTrazas}
        entidad={entidad}
        registroId={registroId}
        titulo={`Trazas de ${nombre}`}
        etiquetas={etiquetas}
        onCerrar={() => setVerTrazas(false)}
      />
    </>
  )
}

/** Campo "Motivo del cambio" de los formularios de edición. */
export function CampoMotivoCambio(props: TextareaProps) {
  return (
    <Textarea
      label="Motivo del cambio"
      withAsterisk
      autosize
      minRows={2}
      maxLength={300}
      placeholder="Indique por qué se modifica el registro y la evidencia que lo respalda (mínimo 20 caracteres)."
      description="Se conserva la versión anterior; el cambio queda en las trazas."
      {...props}
    />
  )
}

// ── Motivo (anular o revertir) ──────────────────────────────────────────────

export type ModoMotivo = 'anular' | 'reversar'

/**
 * Pide el motivo y confirma. Anular no borra: el registro queda marcado,
 * fuera de los indicadores y visible para auditoría.
 */
export function MotivoModal({
  abierto,
  modo,
  titulo,
  enviando,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean
  modo: ModoMotivo
  titulo: string
  enviando: boolean
  onCerrar: () => void
  onConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)
  const error = errorMotivo(motivo)
  const anular = modo === 'anular'
  const cerrar = () => {
    setMotivo('')
    setTocado(false)
    onCerrar()
  }
  return (
    <Modal opened={abierto} onClose={cerrar} title={titulo} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTocado(true)
          if (!error) onConfirmar(motivo.trim())
        }}
      >
        <Stack gap="sm">
          <Textarea
            label={anular ? 'Motivo de la eliminación lógica' : 'Motivo de la reversión'}
            placeholder={
              anular
                ? 'Describa por qué se anula el registro y la evidencia que lo respalda.'
                : 'Describa por qué se restituye el registro y quién lo autoriza.'
            }
            required
            autosize
            minRows={3}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            onBlur={() => setTocado(true)}
            error={tocado ? error : null}
            data-autofocus
          />
          <Text size="xs" c="dimmed">
            {anular
              ? 'El registro no se borra: queda marcado como anulado, se excluye del cálculo de indicadores y permanece visible para auditoría con su motivo, autor y fecha.'
              : 'La reversión restituye el registro al cálculo de indicadores y queda asentada en las trazas.'}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" color={anular ? 'red' : 'blue'} loading={enviando}>
              {anular ? 'Confirmar anulación' : 'Confirmar reversión'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

// ── Trazas ──────────────────────────────────────────────────────────────────

/** Campo especial con el que la API anota anulaciones y reversiones. */
const CAMPO_ESTADO = '__estado_registro'

const texto = (v: unknown): string =>
  v === null || v === undefined || v === ''
    ? '—'
    : typeof v === 'boolean'
      ? v ? 'Sí' : 'No'
      : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
        ? formatearFechaHora(v)
        : String(v)

export function TrazasModal({
  abierto,
  entidad,
  registroId,
  titulo,
  etiquetas,
  onCerrar,
}: {
  abierto: boolean
  entidad: EntidadTraza
  registroId: number
  titulo: string
  /** Nombre legible de cada campo. */
  etiquetas: Record<string, string>
  onCerrar: () => void
}) {
  const trazas = useQuery({
    queryKey: ['trazas', entidad, registroId],
    queryFn: () => ejecutar(api.GET('/api/trazas', { params: { query: { entidad, registroId } } })),
    enabled: abierto && registroId > 0,
  })
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} size="lg">
      {trazas.isPending && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}
      {trazas.error && <Alert color="red">{trazas.error.message}</Alert>}
      {trazas.data && trazas.data.length === 0 && (
        <Text size="sm" c="dimmed">
          Sin modificaciones: el registro está en su versión original.
        </Text>
      )}
      {trazas.data && trazas.data.length > 0 && (
        <Timeline bulletSize={20} lineWidth={2}>
          {trazas.data.map((t) => {
            const estado = t.cambios.find((c) => c.campo === CAMPO_ESTADO)
            const tituloTraza =
              t.accion === 'MODIFICAR'
                ? `v${t.version} → v${t.version + 1} · Modificación`
                : t.accion === 'ANULAR'
                  ? `v${t.version} · Eliminación lógica`
                  : `v${t.version} · Reversión de la anulación`
            return (
              <Timeline.Item key={t.id} title={tituloTraza} color={t.accion === 'ANULAR' ? 'red' : 'blue'}>
                <Text size="xs" c="dimmed">
                  {formatearFechaHora(t.fecha)} · {t.responsable}
                </Text>
                <Text size="sm" mt={2}>
                  Motivo: {t.motivo}
                </Text>
                {!estado &&
                  t.cambios.map((c) => (
                    <Text size="xs" key={c.campo}>
                      <b>{etiquetas[c.campo] ?? c.campo}</b>: «{texto(c.antes)}» → «{texto(c.despues)}»
                    </Text>
                  ))}
              </Timeline.Item>
            )
          })}
        </Timeline>
      )}
    </Modal>
  )
}
