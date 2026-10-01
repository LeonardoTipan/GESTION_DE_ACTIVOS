import {
  Alert,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Center,
  Group,
  Loader,
  Menu,
  NavLink,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconChevronDown,
  IconLogout,
  IconShieldLock,
} from '@tabler/icons-react'
import { useAuth } from 'react-oidc-context'
import { Link, Outlet, useLocation } from 'react-router'
import { ETIQUETA_ROL } from '../../features/auth/roles.ts'
import { useUsuarioActual } from '../../features/auth/use-usuario-actual.ts'
import { menuPara } from '../navegacion.ts'

/** Iniciales para el avatar: "Analista Prueba" → "AP". */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppLayout() {
  const [menuAbierto, { toggle, close }] = useDisclosure()
  const { pathname } = useLocation()
  const auth = useAuth()
  const { data: usuario, isPending, error } = useUsuarioActual()

  const nombre = usuario?.name ?? usuario?.username ?? ''
  const items = usuario ? menuPara(usuario.roles) : []

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !menuAbierto } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={menuAbierto} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon size="lg" radius="md" variant="filled">
              <IconShieldLock size={20} />
            </ThemeIcon>
            <Text fw={600} size="lg">
              Gestión de Activos
            </Text>
          </Group>

          {usuario && (
            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs">
                    <Avatar color="indigo" radius="xl" size="sm">
                      {iniciales(nombre)}
                    </Avatar>
                    <Text size="sm" fw={500} visibleFrom="xs">
                      {nombre}
                    </Text>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{usuario.email ?? usuario.username}</Menu.Label>
                <Group gap={4} px="sm" pb="xs">
                  {usuario.roles.map((rol) => (
                    <Badge key={rol} variant="light" size="sm">
                      {ETIQUETA_ROL[rol]}
                    </Badge>
                  ))}
                </Group>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => void auth.signoutRedirect()}
                >
                  Cerrar sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {items.map((item) => (
          <NavLink
            key={item.ruta}
            component={Link}
            to={item.ruta}
            label={item.etiqueta}
            leftSection={<item.icono size={18} stroke={1.6} />}
            active={
              item.ruta === '/' ? pathname === '/' : pathname.startsWith(item.ruta)
            }
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        {isPending && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {error && (
          <Alert color="red" icon={<IconAlertTriangle />} title="Sin conexión con la API">
            {error.message} Comprueba que el backend esté levantado en el puerto 3000.
          </Alert>
        )}
        {usuario && <Outlet />}
      </AppShell.Main>
    </AppShell>
  )
}
