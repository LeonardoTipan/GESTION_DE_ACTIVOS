import { MultiSelect, type MultiSelectProps } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useRef, useState } from 'react'
import { useActivos } from '../api/activos.ts'

/**
 * Varios equipos OPERATIVOS a la vez (p. ej. la misma vulnerabilidad en
 * varios activos). Busca en la API por código, nombre, categoría o
 * referencia de GLPI; recuerda el nombre de los ya elegidos.
 */
export function SelectorActivos({
  value,
  onChange,
  ...props
}: {
  value: number[]
  onChange: (activoIds: number[]) => void
} & Omit<MultiSelectProps, 'value' | 'onChange' | 'data'>) {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaEstable] = useDebouncedValue(busqueda, 300)
  const resultados = useActivos({ q: busquedaEstable || undefined, limit: 30, page: 1, operativos: true })
  // Nombres de los ya elegidos, aunque ya no salgan en la búsqueda actual.
  const conocidos = useRef(new Map<string, string>())

  const opciones = useMemo(() => {
    for (const a of resultados.data?.data ?? []) {
      conocidos.current.set(String(a.id), `${a.codigo} · ${a.nombre} (${a.categoria.nombre})`)
    }
    const visibles = (resultados.data?.data ?? []).map((a) => String(a.id))
    const ids = [...new Set([...value.map(String), ...visibles])]
    return ids.map((id) => ({ value: id, label: conocidos.current.get(id) ?? `Activo #${id}` }))
  }, [resultados.data, value])

  return (
    <MultiSelect
      searchable
      clearable
      leftSection={<IconSearch size={16} />}
      nothingFoundMessage={resultados.isFetching ? 'Buscando…' : 'Ningún activo operativo coincide'}
      data={opciones}
      value={value.map(String)}
      onChange={(v) => onChange(v.map(Number))}
      searchValue={busqueda}
      onSearchChange={setBusqueda}
      // La API ya filtra por el texto.
      filter={({ options }) => options}
      {...props}
    />
  )
}
