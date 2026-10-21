import { Alert, Button, Divider, Group, Modal, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
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
  type DatosEditar,
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
  nombreSolicitante: string
  cargoSolicitante: string
  nombreUsuarioBeneficiario: string
  departamento: string
  descripcion: string
  /** Solo al corregir una cerrada (admin). */
  fechaAtendido: string | null
  resolucion: string
  motivo: string
}

const largo = (min: number, max: number, mensaje: string) => (v: string) =>
  v.trim().length < min ? mensaje : v.length > max ? `Máximo ${max} caracteres.` : null

/**
 * Alta (sin solicitud), modificación (abierta o pendiente) o corrección de una
 * cerrada (solo admin, con motivo: incluye la fecha atendida y la resolución).
 */
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
  const titulo = !solicitud
    ? 'Nueva solicitud de acceso'
    : solicitud.estado === 'CERRADO'
      ? `Corregir ${solicitud.codigoUnico} (cerrada)`
      : `Modificar ${solicitud.codigoUnico}`
  return (
    <Modal opened={abierto} onClose={onCerrar} size="xl" title={titulo}>
      {abierto && <Formulario solicitud={solicitud} onCerrar={onCerrar} onGuardada={onGuardada} />}
    </Modal>
  )
}

function Formulario({ solicitud: s, onCerrar, onGuardada }: { solicitud?: Solicitud; onCerrar: () => void; onGuardada?: (s: Solicitud) => void }) {
  const crear = useCrearSolicitud()
  const editar = useEditarSolicitud()
  const cerrada = s?.estado === 'CERRADO'
  // En una solicitud anterior a estos campos el solicitante puede faltar: no se exige
  // completarlo para corregir otra cosa (y nunca se inventa).
  const solicitanteObligatorio = !s || Boolean(s.nombreSolicitante)
  const form = useForm<Valores>({
    initialValues: {
      tipoAcceso: s?.tipoAcceso ?? 'LOGICO',
      tipoSolicitud: s?.tipoSolicitud ?? 'ACCESO',
      destino: s && !s.activoId ? 'recurso' : 'activo',
      activoId: s?.activoId ? String(s.activoId) : null,
      recurso: s?.recurso ?? '',
      fechaSolicitud: s ? isoAFechaHoraLocal(s.fechaSolicitud) : ahoraLocal(),
      nombreSolicitante: s?.nombreSolicitante ?? '',
      cargoSolicitante: s?.cargoSolicitante ?? '',
      nombreUsuarioBeneficiario: s?.nombreUsuarioBeneficiario ?? '',
      departamento: s?.departamento ?? '',
      descripcion: s?.descripcion ?? '',
      fechaAtendido: s?.fechaAtendido ? isoAFechaHoraLocal(s.fechaAtendido) : null,
      resolucion: s?.resolucion ?? '',
      motivo: '',
    },
    validate: {
      activoId: (v, x) => (x.destino === 'activo' && !v ? 'Seleccione el activo (o elija «Recurso no inventariado»).' : null),
      recurso: (v, x) =>
        x.destino === 'recurso' && !v.trim() ? 'Describa el recurso (p. ej. «Correo institucional»).' : v.length > 191 ? 'Máximo 191 caracteres.' : null,
      fechaSolicitud: (v) => (!v ? 'Indique cuándo se solicitó.' : instante(v).isAfter(instante(ahoraLocal()).add(5, 'minute')) ? 'No puede ser futura.' : null),
      nombreSolicitante: (v) =>
        !solicitanteObligatorio && !v.trim() ? null : largo(3, 191, 'Indique quién solicita o autoriza (mínimo 3 caracteres).')(v),
      cargoSolicitante: (v, x) =>
        !solicitanteObligatorio && !v.trim() && !x.nombreSolicitante.trim() ? null : largo(2, 191, 'Indique el cargo de quien solicita.')(v),
      nombreUsuarioBeneficiario: largo(3, 191, 'Indique quién recibe o pierde el acceso (mínimo 3 caracteres).'),
      departamento: largo(2, 191, 'Indique el departamento.'),
      descripcion: largo(10, 5000, 'Mínimo 10 caracteres.'),
      fechaAtendido: (v, x) =>
        !cerrada
          ? null
          : !v
            ? 'Una solicitud cerrada exige la fecha atendida.'
            : instante(v).isAfter(instante(ahoraLocal()).add(5, 'minute'))
              ? 'No puede ser futura.'
              : x.fechaSolicitud && instante(v).isBefore(instante(x.fechaSolicitud))
                ? 'No puede ser anterior a la fecha de solicitud.'
                : null,
      resolucion: (v) => (cerrada ? largo(10, 5000, 'Mínimo 10 caracteres.')(v) : null),
      motivo: (v) => (cerrada && v.trim().length < 20 ? 'Corregir una solicitud cerrada exige el motivo (mínimo 20 caracteres).' : null),
    },
  })
  const v = form.values
  // El tipo de acceso solo se cambia en ABIERTO (la API lo exige): cambia la serie del código.
  const tipoBloqueado = Boolean(s && s.estado !== 'ABIERTO')

  const enviar = form.onSubmit((x) => {
    const comunes = {
      tipoAcceso: x.tipoAcceso,
      tipoSolicitud: x.tipoSolicitud,
      fechaSolicitud: fechaHoraLocalAIso(x.fechaSolicitud!),
      nombreUsuarioBeneficiario: x.nombreUsuarioBeneficiario.trim(),
      departamento: x.departamento.trim(),
      descripcion: x.descripcion.trim(),
    }
    const solicitanteDatos = x.nombreSolicitante.trim()
      ? { nombreSolicitante: x.nombreSolicitante.trim(), cargoSolicitante: x.cargoSolicitante.trim() }
      : {}
    const error = (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message })
    const listo = (r: Solicitud) => {
      notifications.show({ color: 'green', title: s ? 'Solicitud modificada' : 'Solicitud registrada', message: `${r.codigoUnico} · cada cambio queda en el historial.` })
      onCerrar()
      onGuardada?.(r)
    }
    if (s) {
      const datos: DatosEditar = {
        ...comunes,
        ...solicitanteDatos,
        ...(x.destino === 'activo' ? { activoId: Number(x.activoId) } : { activoId: null, recurso: x.recurso.trim() }),
        ...(cerrada ? { fechaAtendido: fechaHoraLocalAIso(x.fechaAtendido!), resolucion: x.resolucion.trim() } : {}),
        motivo: x.motivo.trim() || undefined,
      }
      // El tipo de acceso de una solicitud que ya no está abierta no se envía (no cambia).
      if (tipoBloqueado) delete datos.tipoAcceso
      editar.mutate({ id: s.id, datos }, { onSuccess: listo, onError: error })
    } else {
      crear.mutate(
        {
          ...comunes,
          nombreSolicitante: x.nombreSolicitante.trim(),
          cargoSolicitante: x.cargoSolicitante.trim(),
          ...(x.destino === 'activo' ? { activoId: Number(x.activoId) } : { recurso: x.recurso.trim() }),
        },
        { onSuccess: listo, onError: error },
      )
    }
  })

  return (
    <form onSubmit={enviar} noValidate>
      <Stack gap="sm">
        {cerrada && (
          <Alert color="orange" title="Corrección de una solicitud cerrada">
            Solo un administrador puede corregirla. El motivo es obligatorio y cada campo corregido queda en el historial con el
            valor anterior.
          </Alert>
        )}
        {/* Una fila por selector: «BAJA · Desvinculación de acceso» no cabe en media fila. */}
        <SimpleGrid cols={1}>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Tipo de solicitud
            </Text>
            <SegmentedControl
              fullWidth
              data={(['ACCESO', 'BAJA'] as const).map((t) => ({ value: t, label: `${TIPO_SOLICITUD[t].corto} · ${TIPO_SOLICITUD[t].etiqueta}` }))}
              {...form.getInputProps('tipoSolicitud')}
            />
            <Text size="xs" c="dimmed">
              {v.tipoSolicitud === 'BAJA'
                ? 'Retira el acceso a la persona. No retira ni modifica el activo en el inventario ni en GLPI.'
                : 'Concede el acceso a la persona.'}
            </Text>
          </div>
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
        </SimpleGrid>

        <Divider label="Solicitante: quien pide o autoriza el trámite" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Nombre del solicitante" withAsterisk={solicitanteObligatorio} placeholder="Jorge Andrade" {...form.getInputProps('nombreSolicitante')} />
          <TextInput label="Cargo del solicitante" withAsterisk={solicitanteObligatorio} placeholder="Jefe de Contabilidad" {...form.getInputProps('cargoSolicitante')} />
        </SimpleGrid>
        {!solicitanteObligatorio && (
          <Text size="xs" c="dimmed">
            Esta solicitud se registró antes de existir el solicitante. Complételo solo si consta en un documento.
          </Text>
        )}

        <Divider label={v.tipoSolicitud === 'BAJA' ? 'Beneficiario: quien pierde el acceso' : 'Beneficiario: quien recibe el acceso'} labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Nombre del beneficiario" withAsterisk placeholder="María Pérez" {...form.getInputProps('nombreUsuarioBeneficiario')} />
          <TextInput label="Departamento" withAsterisk placeholder="Contabilidad" {...form.getInputProps('departamento')} />
        </SimpleGrid>

        <Divider label="Recurso" labelPosition="left" />
        <SegmentedControl
          data={[
            { value: 'activo', label: 'Activo inventariado' },
            { value: 'recurso', label: 'Recurso no inventariado' },
          ]}
          {...form.getInputProps('destino')}
        />
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
          {cerrada && (
            <DateTimePicker
              label="Fecha atendida"
              description="Fecha y hora reales de la atención"
              valueFormat="DD MMM YYYY HH:mm"
              withAsterisk
              minDate={v.fechaSolicitud ?? undefined}
              maxDate={ahoraLocal()}
              {...form.getInputProps('fechaAtendido')}
            />
          )}
        </SimpleGrid>
        <Textarea label="Descripción o motivo de la solicitud" withAsterisk autosize minRows={2} {...form.getInputProps('descripcion')} />
        {cerrada && <Textarea label="Resolución" withAsterisk autosize minRows={2} {...form.getInputProps('resolucion')} />}
        {s && (
          <Textarea
            label="Motivo del cambio"
            withAsterisk={cerrada}
            description={cerrada ? 'Obligatorio (mínimo 20 caracteres): queda en el historial.' : 'Opcional; queda en el historial junto a cada campo modificado.'}
            autosize
            minRows={1}
            {...form.getInputProps('motivo')}
          />
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" loading={crear.isPending || editar.isPending || crear.isSuccess || editar.isSuccess}>
            {!s ? 'Registrar solicitud' : cerrada ? 'Guardar corrección' : 'Guardar cambios'}
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
