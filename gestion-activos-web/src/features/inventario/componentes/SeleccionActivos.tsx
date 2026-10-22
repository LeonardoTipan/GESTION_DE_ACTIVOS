import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Pagination,
  Pill,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import {
  activosOperativosPorCriticidad,
  useActivos,
  useCategoriasConActivos,
  type Activo,
} from '../api/activos.ts'
import { useCriticidades } from '../api/catalogos.ts'
import { BadgeCriticidad } from './BadgeCriticidad.tsx'
import { agregar, alternar, CRITICIDADES_CRITICAS, opcionesCategoria, TODAS_LAS_CATEGORIAS } from './seleccion.ts'

const POR_PAGINA = 25

interface Props {
  /** Título de la sección (p. ej. "Seleccionar activos para mantenimiento"); se omite si ya lo da el panel. */
  titulo?: string
  /** Etiqueta del campo ("Activos a respaldar"). */
  etiqueta: string
  value: number[]
  onChange: (activoIds: number[]) => void
  /** false = un solo activo (marcar otro sustituye al anterior). */
  multiple?: boolean
  /** Regla propia del módulo: el motivo por el que un activo no se puede elegir, o null. */
  noElegible?: (activo: Activo) => string | null
  /** Insignia propia del módulo junto a cada activo (p. ej. su clase hardware/software). */
  insignia?: (activo: Activo) => ReactNode
  /** Recibe los activos elegidos (con sus datos) cada vez que cambia la selección. */
  onElegidos?: (activos: Activo[]) => void
  error?: ReactNode
  /** Texto de ayuda bajo la lista. */
  ayuda?: ReactNode
}

/**
 * Selección de activos común a Respaldos, Mantenimientos y Vulnerabilidades.
 * Solo ofrece activos OPERATIVOS (la condición física "Malo" sigue siendo
 * operativa). Filtra en el servidor por categoría y por código o nombre, con
 * paginación, así que llega a todo el inventario. Lo ya elegido se conserva al
 * cambiar de categoría o de búsqueda, aunque deje de verse en la lista.
 */
export function SeleccionActivos({
  titulo,
  etiqueta,
  value,
  onChange,
  multiple = true,
  noElegible = () => null,
  insignia,
  onElegidos,
  error,
  ayuda,
}: Props) {
  const [categoria, setCategoria] = useState<string>(TODAS_LAS_CATEGORIAS)
  const [busqueda, setBusqueda] = useState('')
  const [q] = useDebouncedValue(busqueda.trim(), 300)
  const [pagina, setPagina] = useState(1)
  const [aviso, setAviso] = useState<string | null>(null)
  const [buscandoCriticos, setBuscandoCriticos] = useState(false)
  const categoriaId = categoria ? Number(categoria) : undefined

  const categorias = useCategoriasConActivos({ operativos: true })
  const criticidades = useCriticidades()
  const lista = useActivos({
    operativos: true,
    categoriaId,
    q: q || undefined,
    page: pagina,
    limit: POR_PAGINA,
    sort: 'codigo',
    order: 'asc',
  })

  // Nombre de lo ya elegido, aunque no esté en la página visible: se guarda al elegirlo.
  const [conocidos, setConocidos] = useState<ReadonlyMap<number, Activo>>(new Map())
  const recordar = (nuevos: Activo[]) =>
    setConocidos((m) => new Map([...m, ...nuevos.map((a) => [a.id, a] as const)]))
  // Cambia la selección y avisa con los datos de cada activo (los recién elegidos aún no están en «conocidos»).
  const cambiar = (ids: number[], nuevos: Activo[] = []) => {
    onChange(ids)
    if (!onElegidos) return
    const mapa = new Map([...conocidos, ...nuevos.map((a) => [a.id, a] as const)])
    onElegidos(ids.flatMap((id) => mapa.get(id) ?? []))
  }
  const visibles = new Set((lista.data?.data ?? []).map((a) => a.id))
  const fuera = value.filter((id) => !visibles.has(id))

  const seleccionarCriticos = async () => {
    const ids = (criticidades.data ?? []).filter((c) => CRITICIDADES_CRITICAS.includes(c.nivel)).map((c) => c.id)
    if (ids.length === 0) {
      setAviso('No hay niveles de criticidad "Alta" o "Crítica" en el catálogo.')
      return
    }
    setBuscandoCriticos(true)
    try {
      const criticos = await activosOperativosPorCriticidad(ids, categoriaId)
      recordar(criticos)
      const elegibles = criticos.filter((a) => !noElegible(a)).map((a) => a.id)
      const descartados = criticos.length - elegibles.length
      cambiar(agregar(value, elegibles), criticos)
      setAviso(
        criticos.length === 0
          ? `No hay activos críticos operativos${categoriaId ? ' en esta categoría' : ''}.`
          : `${elegibles.length} activo(s) crítico(s) añadido(s)${descartados ? `; ${descartados} no se pueden elegir en este módulo` : ''}.`,
      )
    } catch (e) {
      setAviso(`No se pudieron cargar los activos críticos: ${(e as Error).message}`)
    } finally {
      setBuscandoCriticos(false)
    }
  }

  const etiquetaActivo = (id: number) => {
    const a = conocidos.get(id)
    return a ? `${a.codigo} · ${a.nombre}` : `Activo #${id}`
  }
  const activos = lista.data?.data ?? []
  const meta = lista.data?.meta

  return (
    <Stack gap={6}>
      {titulo && (
        <Text fw={600} size="md">
          {titulo}
        </Text>
      )}
      <Text size="sm" fw={500}>
        {etiqueta} <Text span c="red">*</Text>
      </Text>
      <Group gap="xs">
        {multiple && (
          <Button size="compact-xs" variant="light" loading={buscandoCriticos} onClick={seleccionarCriticos}>
            Seleccionar todos los críticos
          </Button>
        )}
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => {
            cambiar([])
            setAviso(null)
          }}
        >
          Limpiar
        </Button>
        <Text size="xs" c="dimmed">
          {value.length} seleccionado(s)
          {fuera.length > 0 && value.length > 0 ? ` · ${fuera.length} fuera de la lista visible` : ''}
        </Text>
      </Group>
      {aviso && (
        <Text size="xs" c="blue">
          {aviso}
        </Text>
      )}
      <Select
        label="Categoría del activo"
        size="xs"
        data={opcionesCategoria(categorias.data ?? [])}
        value={categoria}
        // Un filtro nuevo siempre empieza en la primera página.
        onChange={(v) => {
          setCategoria(v ?? TODAS_LAS_CATEGORIAS)
          setPagina(1)
        }}
        allowDeselect={false}
        searchable
        nothingFoundMessage="Ninguna categoría coincide"
        comboboxProps={{ withinPortal: true }}
      />
      <TextInput
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder="Buscar por código o nombre…"
        aria-label="Buscar por código o nombre"
        value={busqueda}
        onChange={(e) => {
          setBusqueda(e.currentTarget.value)
          setPagina(1)
        }}
      />
      {lista.error ? (
        <Alert color="red">{lista.error.message}</Alert>
      ) : (
        <ScrollArea.Autosize mah={240} type="auto">
          <Stack gap={4}>
            {lista.isPending && <Loader size="xs" />}
            {!lista.isPending && activos.length === 0 && (
              <Text size="sm" c="dimmed">
                No se encontraron activos operativos{categoriaId ? ' en esta categoría' : ''}
                {q ? ` que coincidan con «${q}»` : ''}.
              </Text>
            )}
            {activos.map((a) => {
              const motivo = noElegible(a)
              const marcado = value.includes(a.id)
              return (
                <Checkbox
                  key={a.id}
                  checked={marcado}
                  // Lo ya elegido siempre se puede desmarcar.
                  disabled={!!motivo && !marcado}
                  onChange={(e) => {
                    const valor = e.currentTarget.checked
                    if (valor) recordar([a])
                    cambiar(alternar(value, a.id, valor, multiple), [a])
                  }}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm">
                        {a.codigo} · {a.nombre}
                      </Text>
                      <BadgeCriticidad nivel={a.criticidad.nivel} />
                      {insignia?.(a)}
                    </Group>
                  }
                  description={motivo ?? `${a.categoria.nombre}${a.estado ? ` · ${a.estado}` : ''}`}
                />
              )
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
      {meta && meta.totalPages > 1 && (
        <Group gap="xs" justify="space-between">
          <Text size="xs" c="dimmed">
            {meta.total} activo(s)
          </Text>
          <Pagination size="xs" total={meta.totalPages} value={pagina} onChange={setPagina} />
        </Group>
      )}
      {fuera.length > 0 && (
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            Elegidos que no aparecen con el filtro actual (se conservan):
          </Text>
          <Group gap={4}>
            {fuera.map((id) => (
              <Pill key={id} size="xs" withRemoveButton onRemove={() => cambiar(value.filter((x) => x !== id))}>
                {etiquetaActivo(id)}
              </Pill>
            ))}
          </Group>
        </Stack>
      )}
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
      {ayuda && (
        <Text size="xs" c="dimmed">
          {ayuda}
        </Text>
      )}
    </Stack>
  )
}
