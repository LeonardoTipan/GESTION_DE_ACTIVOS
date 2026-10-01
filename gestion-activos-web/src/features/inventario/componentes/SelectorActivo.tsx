import { Select, type SelectProps } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useActivo, useActivos } from '../api/activos.ts'

const etiqueta = (a: { codigo: string; nombre: string }) => `${a.codigo} · ${a.nombre}`

/**
 * Buscador de activos VIGENTES con autocompletado contra la API
 * (GET /api/activos?q=). Lo usan los módulos satélite para elegir el activo
 * de un respaldo, mantenimiento o vulnerabilidad.
 */
export function SelectorActivo({
  value,
  onChange,
  ...props
}: {
  value: number | null
  onChange: (activoId: number | null) => void
} & Omit<SelectProps, 'value' | 'onChange' | 'data'>) {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaEstable] = useDebouncedValue(busqueda, 300)
  const resultados = useActivos({ q: busquedaEstable || undefined, limit: 20, page: 1 })

  // Si el valor llega desde fuera (p. ej. ?activoId= en la URL), se recupera su nombre.
  const seleccionado = useActivo(value ?? 0, { enabled: value !== null })

  const opciones = useMemo(() => {
    const lista = (resultados.data?.data ?? []).map((a) => ({
      value: String(a.id),
      label: etiqueta(a),
    }))
    if (value !== null && !lista.some((o) => o.value === String(value))) {
      lista.unshift({
        value: String(value),
        label: seleccionado.data ? etiqueta(seleccionado.data) : `Activo #${value}`,
      })
    }
    return lista
  }, [resultados.data, seleccionado.data, value])

  return (
    <Select
      searchable
      clearable
      nothingFoundMessage={resultados.isFetching ? 'Buscando…' : 'Ningún activo coincide'}
      leftSection={<IconSearch size={16} />}
      data={opciones}
      value={value !== null ? String(value) : null}
      onChange={(v) => onChange(v ? Number(v) : null)}
      searchValue={busqueda}
      onSearchChange={setBusqueda}
      // La API ya filtra por el texto: no volver a filtrar en el navegador.
      filter={({ options }) => options}
      {...props}
    />
  )
}
