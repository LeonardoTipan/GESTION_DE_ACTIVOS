import { Button, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

export function PaginaNoEncontrada() {
  return (
    <Stack align="flex-start" gap="sm">
      <Title order={2}>Página no encontrada</Title>
      <Text c="dimmed">La dirección que buscas no existe.</Text>
      <Button component={Link} to="/" variant="light">
        Volver al panel
      </Button>
    </Stack>
  )
}
