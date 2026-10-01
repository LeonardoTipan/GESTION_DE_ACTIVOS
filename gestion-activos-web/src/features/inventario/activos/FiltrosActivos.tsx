import { Group, SegmentedControl, Select, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useCategorias, useCriticidades } from '../api/catalogos.ts'
import type { FiltrosActivos as Filtros } from './filtros-url.ts'

const OPCIONES_CIFRADO = [
  { value: 'todos', label: 'Todos' },
  { value: 'true', label: 'Cifrados' },
  { value: 'false', label: 'Sin cifrar' },
]

export function FiltrosActivos({
  filtros,
  onChange,
}: {
  filtros: Filtros
  onChange: (cambios: Partial<Filtros>) => void
}) {
  const categorias = useCategorias()
  const criticidades = useCriticidades()

  // La búsqueda espera 400 ms sin teclear antes de consultar la API.
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [busquedaEstable] = useDebouncedValue(busqueda, 400)

  useEffect(() => {
    if (busquedaEstable.trim() !== filtros.q) {
      onChange({ q: busquedaEstable.trim(), page: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo tecleado
  }, [busquedaEstable])

  // Si la URL cambia desde fuera (botón "atrás"), el cuadro de búsqueda la refleja.
  useEffect(() => {
    setBusqueda(filtros.q)
  }, [filtros.q])

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <TextInput
        label="Buscar"
        placeholder="Código, nombre, custodio o ubicación"
        leftSection={<IconSearch size={16} />}
        value={busqueda}
        onChange={(e) => setBusqueda(e.currentTarget.value)}
        w={{ base: '100%', sm: 300 }}
      />
      <Select
        label="Categoría"
        placeholder="Todas"
        clearable
        data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
        value={filtros.categoriaId ? String(filtros.categoriaId) : null}
        onChange={(v) => onChange({ categoriaId: v ? Number(v) : undefined, page: 1 })}
        w={{ base: '100%', sm: 180 }}
      />
      <Select
        label="Criticidad"
        placeholder="Todas"
        clearable
        data={(criticidades.data ?? []).map((c) => ({ value: String(c.id), label: c.nivel }))}
        value={filtros.criticidadId ? String(filtros.criticidadId) : null}
        onChange={(v) => onChange({ criticidadId: v ? Number(v) : undefined, page: 1 })}
        w={{ base: '100%', sm: 160 }}
      />
      <SegmentedControl
        data={OPCIONES_CIFRADO}
        value={filtros.cifrado === undefined ? 'todos' : String(filtros.cifrado)}
        onChange={(v) =>
          onChange({ cifrado: v === 'todos' ? undefined : v === 'true', page: 1 })
        }
      />
    </Group>
  )
}
