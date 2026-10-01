import {
  Button,
  Group,
  Modal,
  SegmentedControl,
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
import { SelectorActivo } from '../../inventario/componentes/SelectorActivo.tsx'
import {
  useRegistrarVulnerabilidad,
  type NivelRiesgo,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { FORMATO_CVE, INFO_NIVEL, NIVELES } from '../riesgo.ts'

/** Tope de los campos de texto largo (el mismo que aplica la API). */
const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  /** Activo preseleccionado (p. ej. si el listado está filtrado por activo). */
  activoInicial?: number
  onRegistrada: (vulnerabilidad: Vulnerabilidad) => void
}

/** Registra la vulnerabilidad en estado ABIERTA. */
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
  const form = useForm<{
    activoId: number | null
    cve: string
    descripcion: string
    nivelRiesgo: NivelRiesgo
    fecha: string | null
    fechaLimite: string | null
  }>({
    initialValues: {
      activoId: activoInicial ?? null,
      cve: '',
      descripcion: '',
      nivelRiesgo: 'ALTO',
      fecha: ahoraLocal(),
      fechaLimite: null,
    },
    transformValues: (v) => ({ ...v, cve: v.cve.trim().toUpperCase() }),
    validate: {
      activoId: (v) => (v ? null : 'Elige el activo afectado'),
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
    },
  })

  const enviar = form.onSubmit((v) =>
    registrar.mutate(
      {
        activoId: v.activoId!,
        cve: v.cve || undefined,
        descripcion: v.descripcion.trim(),
        nivelRiesgo: v.nivelRiesgo,
        fecha: fechaHoraLocalAIso(v.fecha!),
        fechaLimite: v.fechaLimite ? fechaHoraLocalAIso(v.fechaLimite) : undefined,
      },
      {
        onSuccess: (vuln) => {
          notifications.show({
            color: 'green',
            title: 'Vulnerabilidad registrada',
            message: `${vuln.cve ?? `#${vuln.id}`} en ${vuln.activo.codigo} · riesgo ${INFO_NIVEL[vuln.nivelRiesgo].etiqueta.toLowerCase()}.`,
          })
          onClose()
          onRegistrada(vuln)
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo registrar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <SelectorActivo
          label="Activo afectado"
          placeholder="Busca por código o nombre"
          withAsterisk
          value={form.values.activoId}
          onChange={(id) => form.setFieldValue('activoId', id)}
          error={form.errors.activoId}
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
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={registrar.isPending}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
