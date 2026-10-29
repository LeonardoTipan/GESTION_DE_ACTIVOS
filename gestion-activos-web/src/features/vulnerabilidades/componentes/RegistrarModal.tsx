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
import { ahoraLocal, fechaHoraLocalAIso } from '../../../shared/formato.ts'
import { instante } from '../../../shared/zona.ts'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import { BadgeClase } from '../../inventario/componentes/BadgeClase.tsx'
import { SeleccionActivos } from '../../inventario/componentes/SeleccionActivos.tsx'
import { useRegistrarLote, type NivelRiesgo, type Vulnerabilidad } from '../api/vulnerabilidades.ts'
import { FORMATO_CVE, INFO_NIVEL, NIVELES } from '../riesgo.ts'

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
 * Fase 1 · Detección: registra la vulnerabilidad en estado ABIERTO, en uno o varios
 * activos de GLPI (uno por activo). No pide datos de remediación.
 */
export function RegistrarModal({ opened, onClose, ...resto }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Detección · registrar vulnerabilidad" size="xl">
      {/* El formulario vive dentro del Modal: se monta (y se reinicia) en cada apertura. */}
      <FormRegistrar onClose={onClose} {...resto} />
    </Modal>
  )
}

function FormRegistrar({ onClose, activoInicial, onRegistrada }: Omit<Props, 'opened'>) {
  const lote = useRegistrarLote()
  const categorias = useCategorias()
  const claseDe = (categoriaId: number) => categorias.data?.find((c) => c.id === categoriaId)?.claseMantenimiento ?? null
  const form = useForm<{
    activoIds: number[]
    fecha: string | null
    descripcion: string
    nivelRiesgo: NivelRiesgo
    responsable: string
    cve: string
    fechaLimite: string | null
  }>({
    initialValues: {
      activoIds: activoInicial ? [activoInicial] : [],
      fecha: null,
      descripcion: '',
      nivelRiesgo: 'ALTO',
      responsable: '',
      cve: '',
      fechaLimite: null,
    },
    validate: {
      activoIds: (v) => (v.length > 0 ? null : 'Elija al menos un sistema afectado'),
      fecha: (v) => (v ? null : 'Indique cuándo se detectó'),
      descripcion: (v) =>
        !v.trim() ? 'Describa la vulnerabilidad' : v.trim().length > MAX_TEXTO_LARGO ? `Máximo ${MAX_TEXTO_LARGO} caracteres` : null,
      responsable: (v) => (!v.trim() ? 'Indique el responsable' : v.trim().length > 191 ? 'Máximo 191 caracteres' : null),
      cve: (v) => (v.trim() && !FORMATO_CVE.test(v.trim().toUpperCase()) ? 'Formato CVE-AAAA-NNNN (p. ej. CVE-2026-12345)' : null),
      fechaLimite: (v, valores) =>
        v && valores.fecha && instante(v).isBefore(instante(valores.fecha)) ? 'No puede ser anterior a la detección' : null,
    },
  })

  const enviar = form.onSubmit((v) =>
    lote.mutate(
      {
        activoIds: v.activoIds,
        fecha: fechaHoraLocalAIso(v.fecha!),
        descripcion: v.descripcion.trim(),
        nivelRiesgo: v.nivelRiesgo,
        responsable: v.responsable.trim(),
        cve: v.cve.trim().toUpperCase() || undefined,
        fechaLimite: v.fechaLimite ? fechaHoraLocalAIso(v.fechaLimite) : undefined,
      },
      {
        onSuccess: (creadas) => {
          const [primera] = creadas
          notifications.show({
            color: 'green',
            title: creadas.length > 1 ? `${creadas.length} vulnerabilidades registradas` : 'Vulnerabilidad registrada',
            message: `${creadas.map((c) => c.activo.codigo).join(', ')} · criticidad ${INFO_NIVEL[primera.nivelRiesgo].etiqueta.toLowerCase()}. Estado: Abierto.`,
          })
          onClose()
          onRegistrada(primera, creadas.length)
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo registrar', message: e.message }),
      },
    ),
  )

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SeleccionActivos
          aplica="VULNERABILIDAD"
          titulo="Sistema afectado"
          etiqueta="Sistema (activo de GLPI)"
          value={form.values.activoIds}
          onChange={(ids) => form.setFieldValue('activoIds', ids)}
          insignia={(a) => <BadgeClase clase={claseDe(a.categoriaId)} size="xs" />}
          error={form.errors.activoIds}
          ayuda="Uno o varios: se crea un registro por activo, todos o ninguno. Solo se ofrecen activos operativos de categorías habilitadas para Vulnerabilidades (Catálogos > Categorías), sean de hardware o de software."
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Fecha de detección"
            description="Cuándo se identificó (puede ser anterior al registro)"
            placeholder="Elija fecha y hora"
            valueFormat="DD MMM YYYY HH:mm"
            maxDate={ahoraLocal()}
            withAsterisk
            {...form.getInputProps('fecha')}
          />
          <TextInput label="Responsable" description="Persona encargada de gestionarla" placeholder="ANALISTA 1" withAsterisk {...form.getInputProps('responsable')} />
        </SimpleGrid>
        <Textarea
          label="Vulnerabilidad"
          description="Descripción del problema detectado"
          placeholder="Sistema operativo desactualizado"
          withAsterisk
          autosize
          minRows={2}
          maxRows={8}
          {...form.getInputProps('descripcion')}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Criticidad <Text span c="red">*</Text>
          </Text>
          <SegmentedControl
            fullWidth
            color={INFO_NIVEL[form.values.nivelRiesgo].color}
            data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
            {...form.getInputProps('nivelRiesgo')}
          />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="CVE" description="Opcional" placeholder="CVE-2026-12345" {...form.getInputProps('cve')} />
          <DateTimePicker
            label="Plazo de remediación"
            description="Opcional"
            valueFormat="DD MMM YYYY HH:mm"
            minDate={form.values.fecha ?? undefined}
            clearable
            {...form.getInputProps('fechaLimite')}
          />
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={lote.isPending || lote.isSuccess}>
            Registrar (estado Abierto)
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
