import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { Link } from 'react-router'
import { menuPara } from '../../app/navegacion.ts'
import { ETIQUETA_ROL } from '../auth/roles.ts'
import { useUsuarioActual } from '../auth/use-usuario-actual.ts'

/** Fase 1: bienvenida y accesos a los módulos. Los indicadores llegan en la Fase 4. */
export function DashboardPage() {
  const { data: usuario } = useUsuarioActual()
  if (!usuario) return null

  const modulos = menuPara(usuario.roles).filter((item) => item.ruta !== '/')

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Hola, {usuario.name ?? usuario.username}</Title>
        <Group gap="xs" mt={4}>
          <Text c="dimmed" size="sm">
            Has iniciado sesión como
          </Text>
          {usuario.roles.map((rol) => (
            <Badge key={rol} variant="light">
              {ETIQUETA_ROL[rol]}
            </Badge>
          ))}
        </Group>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {modulos.map((modulo) => (
          <Card
            key={modulo.ruta}
            component={Link}
            to={modulo.ruta}
            withBorder
            padding="lg"
            radius="md"
          >
            <Group gap="sm" mb="xs">
              <ThemeIcon variant="light" size="lg" radius="md">
                <modulo.icono size={20} />
              </ThemeIcon>
              <Text fw={600}>{modulo.etiqueta}</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {modulo.descripcion}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
