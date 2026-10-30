import { Alert, Anchor, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { useIndicadores } from './api.ts'
import { tarjetasDe, type Linea } from './indicadores.ts'

function Tarjeta({ titulo, ruta, lineas }: { titulo: string; ruta: string; lineas: Linea[] }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Anchor component={Link} to={ruta} fw={600} size="sm" mb="xs" display="block">
        {titulo}
      </Anchor>
      <Stack gap={4}>
        {lineas.map((l) => (
          <Group key={l.etiqueta} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">{l.etiqueta}</Text>
            <Text size="sm" fw={700} c={l.alerta && l.valor > 0 ? l.alerta : undefined}>{l.valor}</Text>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}

/** Indicadores de todos los módulos. Si la API falla se dice; nunca se muestran ceros en su lugar. */
export function PanelIndicadores() {
  const { data, error, isPending } = useIndicadores()
  return (
    <Stack gap="sm">
      <Title order={3}>Indicadores</Title>
      {error ? (
        <Alert color="red" title="No se pudieron cargar los indicadores">{error.message}</Alert>
      ) : isPending ? (
        <Center py="md"><Loader size="sm" /></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {tarjetasDe(data).map((t) => <Tarjeta key={t.titulo} {...t} />)}
        </SimpleGrid>
      )}
    </Stack>
  )
}
