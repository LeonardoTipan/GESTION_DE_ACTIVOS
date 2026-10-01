import { Alert, Stack, Title } from '@mantine/core'
import { IconBarrierBlock } from '@tabler/icons-react'

/** Marcador para los módulos que se construyen en fases posteriores. */
export function EnConstruccion({ modulo, fase }: { modulo: string; fase: number }) {
  return (
    <Stack gap="md">
      <Title order={2}>{modulo}</Title>
      <Alert icon={<IconBarrierBlock />} title="Módulo en construcción" maw={560}>
        Esta sección se construirá en la Fase {fase} del frontend. La API ya está
        disponible y documentada en Swagger.
      </Alert>
    </Stack>
  )
}
