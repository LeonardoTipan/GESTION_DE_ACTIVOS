import {
  Button,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateInput, DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'
import {
  diaAIso,
  fechaHoraLocalAIso,
  isoADia,
  isoAFechaHoraLocal,
} from '../../../shared/formato.ts'
import { useGuardarActivo, type Activo } from '../api/activos.ts'
import { useCategorias, useCriticidades } from '../api/catalogos.ts'

interface ValoresFormulario {
  codigo: string
  nombre: string
  sistemas: string
  custodio: string
  ubicacion: string
  cifrado: boolean
  /** Datos técnicos: opcionales. */
  numeroSerie: string
  estado: string
  fabricante: string
  comentario: string
  tipo: string
  modelo: string
  tecnicoResponsable: string
  red: string
  contacto: string
  /** Valor del DateTimePicker (hora local) o null. */
  fechaAlta: string | null
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
    numeroSerie: activo?.numeroSerie ?? '',
    estado: activo?.estado ?? '',
    fabricante: activo?.fabricante ?? '',
    comentario: activo?.comentario ?? '',
    tipo: activo?.tipo ?? '',
    modelo: activo?.modelo ?? '',
    tecnicoResponsable: activo?.tecnicoResponsable ?? '',
    red: activo?.red ?? '',
    contacto: activo?.contacto ?? '',
    fechaAlta: activo?.fechaAlta ? isoAFechaHoraLocal(activo.fechaAlta) : null,
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

/** Campos opcionales: solo se comprueba la longitud máxima. */
const opcional = (max: number) => (valor: string) =>
  valor.trim().length > max ? `Máximo ${max} caracteres` : null

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
      numeroSerie: opcional(191),
      estado: opcional(191),
      fabricante: opcional(191),
      comentario: opcional(5000),
      tipo: opcional(191),
      modelo: opcional(191),
      tecnicoResponsable: opcional(191),
      red: opcional(191),
      contacto: opcional(191),
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

  /** Vacío en un alta = no se envía; en una edición se envía "" para poder borrar el dato. */
  const tecnico = (valor: string) => valor.trim() || (activo ? '' : undefined)

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
          numeroSerie: tecnico(v.numeroSerie),
          estado: tecnico(v.estado),
          fabricante: tecnico(v.fabricante),
          comentario: tecnico(v.comentario),
          tipo: tecnico(v.tipo),
          modelo: tecnico(v.modelo),
          tecnicoResponsable: tecnico(v.tecnicoResponsable),
          red: tecnico(v.red),
          contacto: tecnico(v.contacto),
          fechaAlta: v.fechaAlta ? fechaHoraLocalAIso(v.fechaAlta) : undefined,
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
      size="xl"
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
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Contacto" placeholder="jperez" {...form.getInputProps('contacto')} />
            <TextInput
              label="Técnico responsable"
              placeholder="soporte"
              {...form.getInputProps('tecnicoResponsable')}
            />
            <TextInput label="Red" placeholder="LAN administrativa" {...form.getInputProps('red')} />
          </SimpleGrid>

          <Divider label="Datos del equipo (opcionales)" labelPosition="left" mt="xs" />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Tipo" placeholder="Laptop" {...form.getInputProps('tipo')} />
            <TextInput
              label="Fabricante"
              placeholder="ASUSTeK COMPUTER INC."
              {...form.getInputProps('fabricante')}
            />
            <TextInput
              label="Modelo"
              placeholder="ROG Zephyrus M16"
              {...form.getInputProps('modelo')}
            />
            <TextInput
              label="Número de serie"
              placeholder="00330-80000-00000-AA990"
              {...form.getInputProps('numeroSerie')}
            />
            <TextInput label="Estado" placeholder="Bueno" {...form.getInputProps('estado')} />
            <DateTimePicker
              label="Fecha de alta"
              description="Registro en el inventario de origen"
              valueFormat="DD MMM YYYY HH:mm"
              maxDate={new Date()}
              clearable
              {...form.getInputProps('fechaAlta')}
            />
          </SimpleGrid>
          <Textarea
            label="Comentario"
            description="Características técnicas; admite varias líneas"
            placeholder={'Memoria RAM 64 GB\nCapacidad de disco 1 TB'}
            autosize
            minRows={3}
            maxRows={10}
            {...form.getInputProps('comentario')}
          />
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
