import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { SelectorActivos } from '../../inventario/componentes/SelectorActivos.tsx'
import {
  useRegistrarLote,
  useRegistrarVulnerabilidad,
  type Fuente,
  type NivelRiesgo,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { FORMATO_CVE, FUENTES, INFO_FUENTE, INFO_NIVEL, NIVELES } from '../riesgo.ts'

/** Tope de los campos de texto largo (el mismo que aplica la API). */
const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  /** Activo preseleccionado (p. ej. si el listado está filtrado por activo). */
  activoInicial?: number
  /** Con varios activos se recibe la primera y el total creado. */
  onRegistrada: (vulnerabilidad: Vulnerabilidad, total: number) => void
}

/**
 * Capa 1 · Identificación: registra la vulnerabilidad (detectada, pendiente de
 * confirmar) en uno o varios activos. No hay escáner conectado: se registra a
 * mano, indicando la fuente y la evidencia del hallazgo.
 */
export function RegistrarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Registrar vulnerabilidad" size="lg">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <FormRegistrar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormRegistrar({ onClose, activoInicial, onRegistrada }: Omit<Props, 'opened'>) {
  const registrar = useRegistrarVulnerabilidad()
  const lote = useRegistrarLote()
  const form = useForm<{
    activoIds: number[]
    cve: string
    descripcion: string
    nivelRiesgo: NivelRiesgo
    fecha: string | null
    fechaLimite: string | null
    fuente: Fuente
    evidencia: string
  }>({
    initialValues: {
      activoIds: activoInicial ? [activoInicial] : [],
      cve: '',
      descripcion: '',
      nivelRiesgo: 'ALTO',
      fecha: ahoraLocal(),
      fechaLimite: null,
      fuente: 'MANUAL',
      evidencia: '',
    },
    transformValues: (v) => ({ ...v, cve: v.cve.trim().toUpperCase() }),
    validate: {
      activoIds: (v) => (v.length > 0 ? null : 'Elige al menos un activo afectado'),
      cve: (v) =>
        v.trim() && !FORMATO_CVE.test(v.trim().toUpperCase())
          ? 'Formato CVE-AAAA-NNNN (p. ej. CVE-2026-12345)'
          : null,
      descripcion: (v) =>
        !v.trim()
          ? 'Describe la vulnerabilidad'
          : v.trim().length > MAX_TEXTO_LARGO
            ? `Máximo ${MAX_TEXTO_LARGO} caracteres`
            : null,
      fecha: (v) => (v ? null : 'Indica cuándo se detectó'),
      fechaLimite: (v, valores) =>
        v && valores.fecha && dayjs(v).isBefore(dayjs(valores.fecha))
          ? 'No puede ser anterior a la detección'
          : null,
      evidencia: (v) => (v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
    },
  })

  const enviar = form.onSubmit((v) => {
    const datos = {
      cve: v.cve || undefined,
      descripcion: v.descripcion.trim(),
      nivelRiesgo: v.nivelRiesgo,
      fecha: fechaHoraLocalAIso(v.fecha!),
      fechaLimite: v.fechaLimite ? fechaHoraLocalAIso(v.fechaLimite) : undefined,
      fuente: v.fuente,
      evidencia: v.evidencia.trim() || undefined,
    }
    const listo = (creadas: Vulnerabilidad[]) => {
      const [primera] = creadas
      notifications.show({
        color: 'green',
        title: creadas.length > 1 ? `${creadas.length} vulnerabilidades registradas` : 'Vulnerabilidad registrada',
        message: `${primera.cve ?? `#${primera.id}`} en ${creadas.map((c) => c.activo.codigo).join(', ')} · riesgo ${INFO_NIVEL[primera.nivelRiesgo].etiqueta.toLowerCase()}. Pendiente de confirmar.`,
      })
      onClose()
      onRegistrada(primera, creadas.length)
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo registrar', message: e.message })
    if (v.activoIds.length === 1) {
      registrar.mutate({ ...datos, activoId: v.activoIds[0] }, { onSuccess: (x) => listo([x]), onError: error })
    } else {
      lote.mutate({ ...datos, activoIds: v.activoIds }, { onSuccess: listo, onError: error })
    }
  })

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <SelectorActivos
          label="Activos afectados"
          description="Uno o varios: se crea un registro por activo, todos o ninguno."
          placeholder="Busca por código, nombre o categoría"
          withAsterisk
          value={form.values.activoIds}
          onChange={(ids) => form.setFieldValue('activoIds', ids)}
          error={form.errors.activoIds}
        />
        <TextInput
          label="CVE"
          description="Opcional. Identificador público de la vulnerabilidad"
          placeholder="CVE-2026-12345"
          {...form.getInputProps('cve')}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Nivel de riesgo <Text span c="red">*</Text>
          </Text>
          <SegmentedControl
            fullWidth
            color={INFO_NIVEL[form.values.nivelRiesgo].color}
            data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
            {...form.getInputProps('nivelRiesgo')}
          />
        </div>
        <Textarea
          label="Descripción"
          placeholder="OpenSSL 3.0.x vulnerable a desbordamiento de búfer en la verificación de certificados X.509."
          withAsterisk
          autosize
          minRows={3}
          maxRows={10}
          {...form.getInputProps('descripcion')}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Fecha de detección"
            valueFormat="DD MMM YYYY HH:mm"
            maxDate={new Date()}
            withAsterisk
            {...form.getInputProps('fecha')}
          />
          <DateTimePicker
            label="Fecha límite (SLA)"
            description="Opcional. Plazo para remediarla"
            valueFormat="DD MMM YYYY HH:mm"
            minDate={form.values.fecha ? dayjs(form.values.fecha).toDate() : undefined}
            clearable
            {...form.getInputProps('fechaLimite')}
          />
          <Select
            label="Fuente del hallazgo"
            description="No hay escáner conectado: se registra a mano."
            data={FUENTES.map((f) => ({ value: f, label: INFO_FUENTE[f] }))}
            allowDeselect={false}
            {...form.getInputProps('fuente')}
          />
          <TextInput
            label="Evidencia"
            description="Referencia al informe, boletín o captura."
            placeholder="Informe de escaneo 2026-10, hallazgo 45"
            {...form.getInputProps('evidencia')}
          />
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={registrar.isPending || lote.isPending}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
