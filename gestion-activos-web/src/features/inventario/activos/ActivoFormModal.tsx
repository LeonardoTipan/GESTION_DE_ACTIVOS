import {
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import { diaAIso, isoADia } from '../../../shared/formato.ts'
import { useGuardarActivo, type Activo } from '../api/activos.ts'
import { useCategorias, useCriticidades } from '../api/catalogos.ts'

interface ValoresFormulario {
  codigo: string
  nombre: string
  sistemas: string
  custodio: string
  ubicacion: string
  cifrado: boolean
  /** "AAAA-MM-DD", el formato del DateInput de Mantine. */
  ultimaRevision: string | null
  /** Los Select de Mantine trabajan con texto: "3" en vez de 3. */
  categoriaId: string | null
  criticidadId: string | null
}

function valoresIniciales(activo?: Activo): ValoresFormulario {
  return {
    codigo: activo?.codigo ?? '',
    nombre: activo?.nombre ?? '',
    sistemas: activo?.sistemas ?? '',
    custodio: activo?.custodio ?? '',
    ubicacion: activo?.ubicacion ?? '',
    cifrado: activo?.cifrado ?? false,
    ultimaRevision: activo ? isoADia(activo.ultimaRevision) : null,
    categoriaId: activo ? String(activo.categoriaId) : null,
    criticidadId: activo ? String(activo.criticidadId) : null,
  }
}

/** Mismas reglas que el DTO de la API: obligatorio y máximo 191 caracteres. */
const texto = (valor: string) =>
  !valor.trim()
    ? 'Campo obligatorio'
    : valor.trim().length > 191
      ? 'Máximo 191 caracteres'
      : null

const obligatorio = (mensaje: string) => (valor: string | null) =>
  valor ? null : mensaje

/** Alta (sin activo) o edición (con activo) de un activo del inventario. */
export function ActivoFormModal({
  opened,
  onClose,
  activo,
  onGuardado,
}: {
  opened: boolean
  onClose: () => void
  activo?: Activo
  onGuardado?: (activo: Activo) => void
}) {
  const categorias = useCategorias()
  const criticidades = useCriticidades()
  const guardar = useGuardarActivo()

  const form = useForm<ValoresFormulario>({
    initialValues: valoresIniciales(activo),
    validate: {
      codigo: texto,
      nombre: texto,
      sistemas: texto,
      custodio: texto,
      ubicacion: texto,
      ultimaRevision: obligatorio('Indica la fecha de la última revisión'),
      categoriaId: obligatorio('Elige una categoría'),
      criticidadId: obligatorio('Elige un nivel de criticidad'),
    },
  })

  // Cada vez que se abre, el formulario parte de los datos actuales del activo.
  useEffect(() => {
    if (opened) {
      form.setValues(valoresIniciales(activo))
      form.resetDirty(valoresIniciales(activo))
      form.clearErrors()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [opened, activo])

  const enviar = form.onSubmit((v) => {
    guardar.mutate(
      {
        id: activo?.id,
        datos: {
          codigo: v.codigo.trim(),
          nombre: v.nombre.trim(),
          sistemas: v.sistemas.trim(),
          custodio: v.custodio.trim(),
          ubicacion: v.ubicacion.trim(),
          cifrado: v.cifrado,
          ultimaRevision: diaAIso(v.ultimaRevision!),
          categoriaId: Number(v.categoriaId),
          criticidadId: Number(v.criticidadId),
        },
      },
      {
        onSuccess: (guardado) => {
          notifications.show({
            color: 'green',
            title: activo ? 'Activo actualizado' : 'Activo registrado',
            message: `${guardado.codigo} · ${guardado.nombre}`,
          })
          onGuardado?.(guardado)
          onClose()
        },
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: 'No se pudo guardar el activo',
            message: error.message,
          }),
      },
    )
  })

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={activo ? `Editar ${activo.codigo}` : 'Nuevo activo'}
      size="lg"
    >
      <form onSubmit={enviar}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Código"
              placeholder="SRV-001"
              withAsterisk
              {...form.getInputProps('codigo')}
            />
            <TextInput
              label="Nombre"
              placeholder="Servidor de base de datos"
              withAsterisk
              {...form.getInputProps('nombre')}
            />
            <Select
              label="Categoría"
              placeholder="Elige una categoría"
              withAsterisk
              data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
              {...form.getInputProps('categoriaId')}
            />
            <Select
              label="Criticidad"
              placeholder="Elige un nivel"
              withAsterisk
              data={(criticidades.data ?? []).map((c) => ({ value: String(c.id), label: c.nivel }))}
              {...form.getInputProps('criticidadId')}
            />
          </SimpleGrid>
          <TextInput
            label="Sistemas"
            description="Sistemas que soporta o aloja"
            placeholder="ERP, Nómina"
            withAsterisk
            {...form.getInputProps('sistemas')}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Custodio"
              placeholder="Área de Infraestructura"
              withAsterisk
              {...form.getInputProps('custodio')}
            />
            <TextInput
              label="Ubicación"
              placeholder="Centro de datos - Rack 3"
              withAsterisk
              {...form.getInputProps('ubicacion')}
            />
            <DateInput
              label="Última revisión"
              placeholder="Elige la fecha"
              valueFormat="DD MMM YYYY"
              maxDate={new Date()}
              withAsterisk
              {...form.getInputProps('ultimaRevision')}
            />
            <Switch
              label="La información del activo está cifrada"
              mt={{ base: 0, sm: 'xl' }}
              {...form.getInputProps('cifrado', { type: 'checkbox' })}
            />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardar.isPending}>
              {activo ? 'Guardar cambios' : 'Registrar activo'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
