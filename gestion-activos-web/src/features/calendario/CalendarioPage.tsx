import { Chip, Group, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { NOMBRE_MODULO, type Modulo } from '../../shared/calendario/agenda.ts'
import { Calendario } from '../../shared/calendario/Calendario.tsx'

const MODULOS: Modulo[] = ['respaldos', 'mantenimientos', 'vulnerabilidades', 'renovaciones', 'endpoints', 'evaluaciones']

/**
 * Calendario general del proyecto: lo planificado, lo ejecutado realmente y
 * lo verificado de los tres módulos, en una sola vista (además de los
 * calendarios de cada etapa dentro de cada módulo).
 */
export function CalendarioPage() {
  const [modulos, setModulos] = useState<Modulo[]>(MODULOS)
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Calendario general</Title>
        <Text c="dimmed" size="sm">
          Planificación, ejecución y verificación de respaldos, mantenimientos y vulnerabilidades. Las acciones se hacen
          desde el registro de cada evento, según su perfil.
        </Text>
      </div>
      <Group gap="xs">
        <Text size="sm" fw={500}>
          Módulos:
        </Text>
        <Chip.Group multiple value={modulos} onChange={(v) => v.length > 0 && setModulos(v as Modulo[])}>
          {MODULOS.map((m) => (
            <Chip key={m} value={m} size="sm">
              {NOMBRE_MODULO[m]}
            </Chip>
          ))}
        </Chip.Group>
      </Group>
      <Calendario titulo="Todo el proyecto" descripcion="Elija la capa para ver una sola etapa." modulos={modulos} />
    </Stack>
  )
}
