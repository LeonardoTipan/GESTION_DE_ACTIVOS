import { Alert, Stack, Title } from '@mantine/core'
import { IconBarrierBlock } from '@tabler/icons-react'

/** Texto exacto de los módulos que aún no tienen funcionalidad. */
export const MENSAJE_EN_DESARROLLO = 'Módulo en desarrollo - Próximamente disponible'

/**
 * Vista provisional de un módulo del menú que todavía no está construido: no consulta
 * la API ni muestra datos.
 */
export function EnConstruccion({ modulo }: { modulo: string }) {
  return (
    <Stack gap="md">
      <Title order={2}>{modulo}</Title>
      <Alert icon={<IconBarrierBlock />} maw={560}>
        {MENSAJE_EN_DESARROLLO}
      </Alert>
    </Stack>
  )
}
