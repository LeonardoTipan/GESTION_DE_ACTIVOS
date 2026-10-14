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
import { fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoMotivoCambio } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import {
  useEditarVulnerabilidad,
  type NivelRiesgo,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'
import { FORMATO_CVE, INFO_NIVEL, NIVELES } from '../riesgo.ts'

/** Tope de los campos de texto largo (el mismo que aplica la API). */
const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  vulnerabilidad: Vulnerabilidad
}

/** Corrige los datos de una vulnerabilidad. Solo mientras está pendiente. */
export function EditarVulnerabilidadModal({ opened, onClose, vulnerabilidad }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Editar ${vulnerabilidad.cve ?? `la vulnerabilidad #${vulnerabilidad.id}`}`}
      size="lg"
    >
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <Formulario onClose={onClose} vulnerabilidad={vulnerabilidad} />
    </Modal>
  )
}

function Formulario({ onClose, vulnerabilidad: v0 }: Omit<Props, 'opened'>) {
  const editar = useEditarVulnerabilidad()
  const form = useForm<{
    cve: string
    descripcion: string
    nivelRiesgo: NivelRiesgo
    fecha: string | null
    fechaLimite: string | null
    motivoCambio: string
  }>({
    initialValues: {
      cve: v0.cve ?? '',
      descripcion: v0.descripcion,
      nivelRiesgo: v0.nivelRiesgo,
      fecha: isoAFechaHoraLocal(v0.fecha),
      fechaLimite: v0.fechaLimite ? isoAFechaHoraLocal(v0.fechaLimite) : null,
      motivoCambio: '',
    },
    validate: {
      motivoCambio: errorMotivo,
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
    editar.mutate(
      {
        id: v0.id,
        datos: {
          // El CVE y el plazo solo se envían si tienen valor: la API no admite vaciarlos.
          cve: v.cve.trim() ? v.cve.trim().toUpperCase() : undefined,
          descripcion: v.descripcion.trim(),
          nivelRiesgo: v.nivelRiesgo,
          fecha: fechaHoraLocalAIso(v.fecha!),
          fechaLimite: v.fechaLimite ? fechaHoraLocalAIso(v.fechaLimite) : undefined,
          motivoCambio: v.motivoCambio.trim(),
        },
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: 'Vulnerabilidad actualizada',
            message: 'Se guardó una nueva versión; la anterior queda en las trazas.',
          })
          onClose()
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Solo se puede editar mientras está pendiente. El activo afectado no se puede cambiar.
        </Text>
        <TextInput
          label="CVE"
          description="Identificador público de la vulnerabilidad"
          placeholder="CVE-2026-12345"
          {...form.getInputProps('cve')}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Nivel de riesgo
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
            valueFormat="DD MMM YYYY HH:mm"
            minDate={form.values.fecha ? dayjs(form.values.fecha).toDate() : undefined}
            {...form.getInputProps('fechaLimite')}
          />
        </SimpleGrid>
        <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={editar.isPending} disabled={!form.isDirty()}>
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
