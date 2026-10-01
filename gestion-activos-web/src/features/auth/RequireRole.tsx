import { Alert, Center, Loader } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { tieneRol, type Rol } from './roles.ts'
import { useUsuarioActual } from './use-usuario-actual.ts'

/**
 * Muestra el contenido solo a los roles indicados. Es una ayuda de interfaz:
 * aunque alguien la saltara, la API respondería 403.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly Rol[]
  children: ReactNode
}) {
  const { data: usuario, isPending } = useUsuarioActual()

  if (isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }

  if (!usuario || !tieneRol(usuario.roles, roles)) {
    return (
      <Alert color="orange" icon={<IconLock />} title="Acceso restringido" maw={560}>
        Esta sección requiere uno de estos roles: {roles.join(', ')}.
      </Alert>
    )
  }

  return children
}
