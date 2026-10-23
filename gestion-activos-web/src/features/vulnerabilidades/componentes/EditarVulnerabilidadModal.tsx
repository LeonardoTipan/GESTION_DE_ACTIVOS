import { Button, Group, Modal, SegmentedControl, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../../shared/formato.ts'
import { CampoMotivoCambio } from '../../../shared/registro/componentes.tsx'
import { errorMotivo } from '../../../shared/registro/registro.ts'
import { instante } from '../../../shared/zona.ts'
import { useEditarVulnerabilidad, type NivelRiesgo, type Vulnerabilidad } from '../api/vulnerabilidades.ts'
import { FORMATO_CVE, INFO_NIVEL, NIVELES } from '../riesgo.ts'

const MAX_TEXTO_LARGO = 5000

interface Props {
  opened: boolean
  onClose: () => void
  vulnerabilidad: Vulnerabilidad
}

/**
 * Fase 1 · Detección: corrige sus datos (criticidad, responsable, descripción,
 * fechas, CVE) con motivo, mientras está pendiente. Cada cambio queda en la auditoría.
 */
export function EditarVulnerabilidadModal({ opened, onClose, vulnerabilidad }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Corregir la detección · #${vulnerabilidad.id}`} size="lg">
      <Formulario onClose={onClose} vulnerabilidad={vulnerabilidad} />
    </Modal>
  )
}

function Formulario({ onClose, vulnerabilidad: v0 }: Omit<Props, 'opened'>) {
  const editar = useEditarVulnerabilidad()
  const inicial = {
    fecha: isoAFechaHoraLocal(v0.fecha) as string | null,
    descripcion: v0.descripcion,
    nivelRiesgo: v0.nivelRiesgo,
    responsable: v0.responsable ?? '',
    cve: v0.cve ?? '',
    fechaLimite: v0.fechaLimite ? isoAFechaHoraLocal(v0.fechaLimite) : (null as string | null),
    motivoCambio: '',
  }
  const form = useForm<typeof inicial & { nivelRiesgo: NivelRiesgo }>({
    initialValues: inicial,
    validate: {
      fecha: (v) => (v ? null : 'Indique cuándo se detectó'),
      descripcion: (v) => (!v.trim() ? 'Describa la vulnerabilidad' : v.trim().length > MAX_TEXTO_LARGO ? `Máximo ${MAX_TEXTO_LARGO} caracteres` : null),
      responsable: (v) => (!v.trim() ? 'Indique el responsable' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      cve: (v) => (v.trim() && !FORMATO_CVE.test(v.trim().toUpperCase()) ? 'Formato CVE-AAAA-NNNN' : null),
      fechaLimite: (v, valores) =>
        v && valores.fecha && instante(v).isBefore(instante(valores.fecha)) ? 'No puede ser anterior a la detección' : null,
      motivoCambio: errorMotivo,
    },
  })

  // Solo se envía lo que cambió: cada cambio queda en la traza con su valor anterior.
  const enviar = form.onSubmit((v) => {
    const cambio = <T,>(nuevo: T, antes: T) => (nuevo !== antes ? nuevo : undefined)
    editar.mutate(
      {
        id: v0.id,
        datos: {
          fecha: v.fecha !== inicial.fecha ? fechaHoraLocalAIso(v.fecha!) : undefined,
          descripcion: cambio(v.descripcion.trim(), inicial.descripcion),
          nivelRiesgo: cambio(v.nivelRiesgo, inicial.nivelRiesgo),
          responsable: cambio(v.responsable.trim(), inicial.responsable),
          cve: cambio(v.cve.trim().toUpperCase(), inicial.cve) || undefined,
          fechaLimite: v.fechaLimite && v.fechaLimite !== inicial.fechaLimite ? fechaHoraLocalAIso(v.fechaLimite) : undefined,
          motivoCambio: v.motivoCambio.trim(),
        },
      },
      {
        onSuccess: (r) => {
          notifications.show({ color: 'green', title: 'Detección corregida', message: `Versión ${r.version}; el cambio queda en la auditoría.` })
          onClose()
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }),
      },
    )
  })

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker label="Fecha de detección" valueFormat="DD MMM YYYY HH:mm" maxDate={ahoraLocal()} withAsterisk {...form.getInputProps('fecha')} />
          <TextInput label="Responsable" withAsterisk {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Textarea label="Vulnerabilidad" withAsterisk autosize minRows={2} maxRows={8} {...form.getInputProps('descripcion')} />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Criticidad
          </Text>
          <SegmentedControl
            fullWidth
            color={INFO_NIVEL[form.values.nivelRiesgo].color}
            data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
            {...form.getInputProps('nivelRiesgo')}
          />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="CVE" description="Opcional" {...form.getInputProps('cve')} />
          <DateTimePicker label="Plazo de remediación" description="Opcional" valueFormat="DD MMM YYYY HH:mm" clearable {...form.getInputProps('fechaLimite')} />
        </SimpleGrid>
        <CampoMotivoCambio {...form.getInputProps('motivoCambio')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" loading={editar.isPending || editar.isSuccess} disabled={!form.isDirty()}>
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
