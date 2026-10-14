import { Badge, Button, Card, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import type { ReactNode } from 'react'
import { usePuedeOperar } from '../../auth/use-puede.ts'
import type { Tablero, VentanaCalendario } from '../api/respaldos.ts'
import { folio } from '../folios.ts'

/** Panel con título y control ISO, como las secciones del prototipo. */
export function Panel({
  titulo,
  control,
  pista,
  extra,
  children,
}: {
  titulo: string
  control: string
  pista?: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm" gap="xs">
        <Group gap="xs">
          <Title order={4}>{titulo}</Title>
          <Badge size="xs" variant="outline">
            {control}
          </Badge>
          {extra}
        </Group>
        {pista && (
          <Text size="xs" c="dimmed">
            {pista}
          </Text>
        )}
      </Group>
      {children}
    </Card>
  )
}

const COLOR_VENTANA: Record<string, string> = {
  CUMPLIDA: 'green',
  VENCIDA: 'red',
  EN_CURSO: 'yellow',
  PROGRAMADA: 'gray',
}
const TEXTO_VENTANA: Record<string, string> = {
  CUMPLIDA: 'Cumplida',
  VENCIDA: 'Vencida sin registro',
  EN_CURSO: 'En curso — por reportar',
  PROGRAMADA: 'Programada a futuro',
}

/**
 * Calendario de ventanas programadas: una fila por plan vigente. Pulsar una
 * ventana carga el formulario con el plan y la fecha (si se puede operar).
 */
export function Calendario({
  tablero,
  tipo,
  titulo,
  control,
  explicacion,
  onSeleccionar,
}: {
  tablero: Tablero | undefined
  tipo: 'ejecucion' | 'prueba'
  titulo: string
  control: string
  explicacion: string
  onSeleccionar: (planId: number, ventana: VentanaCalendario) => void
}) {
  const puedeOperar = usePuedeOperar()
  if (!tablero || tablero.calendario.length === 0) return null
  const pendientes = tipo === 'ejecucion' ? tablero.pendientes.ejecucion : tablero.pendientes.prueba
  return (
    <Panel titulo={titulo} control={control} pista={`${pendientes} ventana(s) por reportar`}>
      <Text size="sm" c="dimmed" mb="xs" maw={720}>
        {explicacion}
      </Text>
      <Group gap="md" mb="sm">
        {Object.entries(TEXTO_VENTANA).map(([estado, textoVentana]) => (
          <Group gap={4} key={estado}>
            <Badge size="xs" circle color={COLOR_VENTANA[estado]}>
              {' '}
            </Badge>
            <Text size="xs">{textoVentana}</Text>
          </Group>
        ))}
      </Group>
      <Stack gap="xs">
        {tablero.calendario.map((plan) => {
          const ventanas = plan[tipo]
          const cumplidas = ventanas.filter((w) => w.estado === 'CUMPLIDA').length
          return (
            <Group key={plan.planId} gap="sm" align="flex-start" wrap="nowrap">
              <Stack gap={0} w={200} style={{ flexShrink: 0 }}>
                <Text size="sm" fw={600}>
                  {plan.activo.nombre}
                </Text>
                <Text size="xs" c="dimmed">
                  {folio('PLN', plan.planId)} · {cumplidas} de {ventanas.length} cubierta(s)
                </Text>
              </Stack>
              <Group gap={4}>
                {ventanas.map((w) => (
                  <Tooltip key={w.ini} label={`${w.etiqueta} (${w.ini} a ${w.fin}) — ${TEXTO_VENTANA[w.estado]}`}>
                    <Button
                      size="compact-xs"
                      variant={w.estado === 'PROGRAMADA' ? 'default' : 'light'}
                      color={COLOR_VENTANA[w.estado]}
                      onClick={() => puedeOperar && onSeleccionar(plan.planId, w)}
                      style={{ cursor: puedeOperar ? 'pointer' : 'default' }}
                    >
                      {w.corto}
                    </Button>
                  </Tooltip>
                ))}
              </Group>
            </Group>
          )
        })}
      </Stack>
    </Panel>
  )
}
