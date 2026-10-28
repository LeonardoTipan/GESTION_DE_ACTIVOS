import { Group, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

/**
 * Encabezado de la sección de una fase (patrón de Planificación de Mantenimientos):
 * título a la izquierda, acción principal a la derecha y, si hace falta, una línea
 * que explica qué muestra la sección. Solo presenta: la acción la decide cada módulo.
 */
export function EncabezadoSeccion({ titulo, descripcion, accion }: { titulo: string; descripcion?: ReactNode; accion?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end">
      <div>
        <Title order={4}>{titulo}</Title>
        {descripcion && (
          <Text size="sm" c="dimmed">
            {descripcion}
          </Text>
        )}
      </div>
      {accion}
    </Group>
  )
}
