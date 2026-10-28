import { Card, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

/**
 * Piezas del tablero de la fase inicial, tal como las dibuja Planificación de
 * Mantenimientos (la referencia visual): cifras arriba y paneles debajo.
 * Solo presentan: cada módulo calcula sus valores con sus propios datos.
 */

/** Cifra del tablero: título en versalitas, valor grande (en color si no es 0) y una pista. */
export function Cifra({ titulo, valor, color, pista }: { titulo: string; valor: number | undefined; color?: string; pista: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {titulo}
      </Text>
      <Text fz={28} fw={700} c={valor ? color : undefined}>
        {valor ?? '—'}
      </Text>
      <Text size="xs" c="dimmed">
        {pista}
      </Text>
    </Card>
  )
}

/** Panel del tablero: tarjeta con su título y el contenido que aporta el módulo. */
export function PanelTablero({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card withBorder padding="sm">
      <Title order={5} mb="xs">
        {titulo}
      </Title>
      {children}
    </Card>
  )
}
