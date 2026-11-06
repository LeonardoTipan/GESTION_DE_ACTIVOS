import { TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

/** Texto libre con espera (400 ms): no consulta la API en cada tecla. Común a las Bitácoras. */
export function CampoBusqueda({ valor, onCambio, label, placeholder }: { valor?: string; onCambio: (v: string | undefined) => void; label: string; placeholder: string }) {
  const [texto, setTexto] = useState(valor ?? '')
  const [estable] = useDebouncedValue(texto, 400)
  useEffect(() => {
    if ((estable.trim() || undefined) !== valor) onCambio(estable.trim() || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo tecleado
  }, [estable])
  return (
    <TextInput
      label={label}
      placeholder={placeholder}
      leftSection={<IconSearch size={14} />}
      value={texto}
      onChange={(e) => setTexto(e.currentTarget.value)}
      w={{ base: '100%', sm: 220 }}
    />
  )
}
