import { Alert, Button, Group, Modal, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { ahoraLocal, fechaHoraLocalAIso, isoAFechaHoraLocal } from '../../shared/formato.ts'
import { instante } from '../../shared/zona.ts'
import {
  useActivosElegibles,
  useCategoriasElegibles,
  useCrearSolicitud,
  useEditarSolicitud,
  type Solicitud,
  type TipoAcceso,
  type TipoSolicitud,
} from './api.ts'
import { TIPO_ACCESO, TIPO_SOLICITUD } from './textos.ts'

type Destino = 'activo' | 'recurso'

interface Valores {
  tipoAcceso: TipoAcceso
  tipoSolicitud: TipoSolicitud
  destino: Destino
  activoId: string | null
  recurso: string
  fechaSolicitud: string | null
  fechaAccesoDeseada: string | null
  nombreUsuarioBeneficiario: string
  departamento: string
  descripcion: string
  motivo: string
}

/** Alta (sin solicitud) o modificación (con ella) de una solicitud de acceso. */
export function SolicitudFormModal({
  abierto,
  onCerrar,
  solicitud,
  onGuardada,
}: {
  abierto: boolean
  onCerrar: () => void
  solicitud?: Solicitud
  onGuardada?: (s: Solicitud) => void
}) {
  return (
    <Modal opened={abierto} onClose={onCerrar} size="xl" title={solicitud ? `Modificar ${solicitud.codigoUnico}` : 'Nueva solicitud de acceso'}>
      {abierto && <Formulario solicitud={solicitud} onCerrar={onCerrar} onGuardada={onGuardada} />}
    </Modal>
  )
}

function Formulario({ solicitud: s, onCerrar, onGuardada }: { solicitud?: Solicitud; onCerrar: () => void; onGuardada?: (s: Solicitud) => void }) {
  const crear = useCrearSolicitud()
  const editar = useEditarSolicitud()
  const form = useForm<Valores>({
    initialValues: {
      tipoAcceso: s?.tipoAcceso ?? 'LOGICO',
      tipoSolicitud: s?.tipoSolicitud ?? 'ACCESO',
      destino: s && !s.activoId ? 'recurso' : 'activo',
      activoId: s?.activoId ? String(s.activoId) : null,
      recurso: s?.recurso ?? '',
      fechaSolicitud: s ? isoAFechaHoraLocal(s.fechaSolicitud) : ahoraLocal(),
      fechaAccesoDeseada: s ? isoAFechaHoraLocal(s.fechaAccesoDeseada) : null,
      nombreUsuarioBeneficiario: s?.nombreUsuarioBeneficiario ?? '',
      departamento: s?.departamento ?? '',
      descripcion: s?.descripcion ?? '',
      motivo: '',
    },
    validate: {
      activoId: (v, x) => (x.destino === 'activo' && !v ? 'Seleccione el activo (o elija «Recurso no inventariado»).' : null),
      recurso: (v, x) =>
        x.destino === 'recurso' && !v.trim() ? 'Describa el recurso (p. ej. «Correo institucional»).' : v.length > 191 ? 'Máximo 191 caracteres.' : null,
      fechaSolicitud: (v) => (!v ? 'Indique cuándo se solicitó.' : instante(v).isAfter(instante(ahoraLocal()).add(5, 'minute')) ? 'No puede ser futura.' : null),
      fechaAccesoDeseada: (v, x) =>
        !v ? 'Indique la fecha deseada.' : x.fechaSolicitud && instante(v).isBefore(instante(x.fechaSolicitud)) ? 'No puede ser anterior a la solicitud.' : null,
      nombreUsuarioBeneficiario: (v) => (v.trim().length < 3 ? 'Mínimo 3 caracteres.' : v.length > 191 ? 'Máximo 191.' : null),
      departamento: (v) => (v.trim().length < 2 ? 'Indique el departamento.' : v.length > 191 ? 'Máximo 191.' : null),
      descripcion: (v) => (v.trim().length < 10 ? 'Mínimo 10 caracteres.' : v.length > 5000 ? 'Máximo 5000.' : null),
    },
  })
  const v = form.values
  // El tipo solo se cambia en ABIERTO (la API lo exige): cambia la serie del código.
  const tipoBloqueado = Boolean(s && s.estado !== 'ABIERTO')

  const enviar = form.onSubmit((x) => {
    const comunes = {
      tipoAcceso: x.tipoAcceso,
      tipoSolicitud: x.tipoSolicitud,
      fechaSolicitud: fechaHoraLocalAIso(x.fechaSolicitud!),
      fechaAccesoDeseada: fechaHoraLocalAIso(x.fechaAccesoDeseada!),
      nombreUsuarioBeneficiario: x.nombreUsuarioBeneficiario.trim(),
      departamento: x.departamento.trim(),
      descripcion: x.descripcion.trim(),
    }
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    const listo = (r: Solicitud) => {
      notifications.show({ color: 'green', title: s ? 'Solicitud modificada' : 'Solicitud registrada', message: `${r.codigoUnico} · cada cambio queda en el historial.` })
      onCerrar()
      onGuardada?.(r)
    }
    if (s) {
      editar.mutate(
        {
          id: s.id,
          datos: {
            ...comunes,
            ...(x.destino === 'activo' ? { activoId: Number(x.activoId) } : { activoId: null, recurso: x.recurso.trim() }),
            motivo: x.motivo.trim() || undefined,
          },
        },
        { onSuccess: listo, onError: error },
      )
    } else {
      crear.mutate(
        { ...comunes, ...(x.destino === 'activo' ? { activoId: Number(x.activoId) } : { recurso: x.recurso.trim() }) },
        { onSuccess: listo, onError: error },
      )
    }
  })

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Tipo de acceso
            </Text>
            <SegmentedControl
              fullWidth
              disabled={tipoBloqueado}
              data={(['LOGICO', 'FISICO'] as const).map((t) => ({ value: t, label: TIPO_ACCESO[t].etiqueta }))}
              value={v.tipoAcceso}
              onChange={(t) => {
                form.setFieldValue('tipoAcceso', t as TipoAcceso)
                // El activo elegido puede no ser elegible para el otro tipo.
                form.setFieldValue('activoId', null)
              }}
            />
            {tipoBloqueado && (
              <Text size="xs" c="dimmed">
                Solo se cambia mientras está abierta.
              </Text>
            )}
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Tipo de solicitud
            </Text>
            <SegmentedControl
              fullWidth
              data={(['ACCESO', 'BAJA'] as const).map((t) => ({ value: t, label: TIPO_SOLICITUD[t] }))}
              {...form.getInputProps('tipoSolicitud')}
            />
          </div>
        </SimpleGrid>

        <div>
          <Text size="sm" fw={500} mb={4}>
            ¿Sobre qué?
          </Text>
          <SegmentedControl
            data={[
              { value: 'activo', label: 'Activo inventariado' },
              { value: 'recurso', label: 'Recurso no inventariado' },
            ]}
            {...form.getInputProps('destino')}
          />
        </div>
        {v.destino === 'activo' ? (
          <SelectorActivoElegible
            tipoAcceso={v.tipoAcceso}
            value={v.activoId}
            inicial={s?.activo ?? null}
            onChange={(id) => form.setFieldValue('activoId', id)}
            error={form.errors.activoId}
          />
        ) : (
          <TextInput
            label="Recurso"
            withAsterisk
            placeholder="Correo institucional, sistema contable, sala de servidores…"
            description="Para recursos que no están en el inventario. No se crea ningún activo en GLPI."
            {...form.getInputProps('recurso')}
          />
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker label="Fecha de solicitud" valueFormat="DD MMM YYYY HH:mm" withAsterisk maxDate={ahoraLocal()} {...form.getInputProps('fechaSolicitud')} />
          <DateTimePicker
            label="Fecha y hora deseadas"
            description="Cuándo se espera otorgar (o retirar) el acceso"
            valueFormat="DD MMM YYYY HH:mm"
            withAsterisk
            minDate={v.fechaSolicitud ?? undefined}
            {...form.getInputProps('fechaAccesoDeseada')}
          />
          <TextInput label="Beneficiario" withAsterisk placeholder="Nombre de la persona" {...form.getInputProps('nombreUsuarioBeneficiario')} />
          <TextInput label="Departamento" withAsterisk placeholder="Contabilidad" {...form.getInputProps('departamento')} />
        </SimpleGrid>
        <Textarea label="Descripción o motivo" withAsterisk autosize minRows={2} {...form.getInputProps('descripcion')} />
        {s && <Textarea label="Motivo del cambio" description="Opcional; queda en el historial junto a cada campo modificado." autosize minRows={1} {...form.getInputProps('motivo')} />}

        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" loading={crear.isPending || editar.isPending || crear.isSuccess || editar.isSuccess}>
            {s ? 'Guardar cambios' : 'Registrar solicitud'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/**
 * Un activo vigente cuya categoría admite el tipo de acceso (Catálogos). La
 * búsqueda y el filtro de categoría se resuelven en el servidor.
 */
function SelectorActivoElegible({
  tipoAcceso,
  value,
  inicial,
  onChange,
  error,
}: {
  tipoAcceso: TipoAcceso
  value: string | null
  inicial: Solicitud['activo']
  onChange: (id: string | null) => void
  error?: React.ReactNode
}) {
  const [categoria, setCategoria] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [q] = useDebouncedValue(busqueda.trim(), 300)
  const categorias = useCategoriasElegibles(tipoAcceso)
  const activos = useActivosElegibles(tipoAcceso, q, categoria ? Number(categoria) : undefined, 1)
  const [elegido, setElegido] = useState(inicial)

  const opciones = (activos.data?.data ?? []).map((a) => ({ value: String(a.id), label: `${a.codigo} · ${a.nombre}`, activo: a }))
  // El elegido sigue visible aunque la búsqueda ya no lo devuelva.
  if (elegido && value === String(elegido.id) && !opciones.some((o) => o.value === value)) {
    opciones.unshift({ value: String(elegido.id), label: `${elegido.codigo} · ${elegido.nombre}`, activo: elegido })
  }
  const sinElegibles = categorias.data && categorias.data.length === 0

  return (
    <Stack gap={6}>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Select
          label="Categoría"
          placeholder="Todas las elegibles"
          clearable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.categoriaId), label: `${c.nombre} (${c.total})` }))}
          value={categoria}
          onChange={setCategoria}
        />
        <Select
          style={{ gridColumn: 'span 2' }}
          label={`Activo (elegible para acceso ${TIPO_ACCESO[tipoAcceso].etiqueta.toLowerCase()})`}
          withAsterisk
          searchable
          clearable
          placeholder="Buscar por código o nombre"
          nothingFoundMessage={activos.isFetching ? 'Buscando…' : 'Ningún activo elegible coincide'}
          // La búsqueda la hace el servidor: no se vuelve a filtrar aquí.
          filter={({ options }) => options}
          searchValue={busqueda}
          onSearchChange={setBusqueda}
          data={opciones.map(({ value: val, label }) => ({ value: val, label }))}
          value={value}
          onChange={(id) => {
            setElegido(opciones.find((o) => o.value === id)?.activo ?? null)
            onChange(id)
          }}
          error={error}
        />
      </SimpleGrid>
      {sinElegibles && (
        <Alert color="orange">
          Ninguna categoría admite acceso {TIPO_ACCESO[tipoAcceso].etiqueta.toLowerCase()} todavía: un administrador puede marcarlas en Catálogos, o
          registre la solicitud sobre un recurso no inventariado.
        </Alert>
      )}
    </Stack>
  )
}
