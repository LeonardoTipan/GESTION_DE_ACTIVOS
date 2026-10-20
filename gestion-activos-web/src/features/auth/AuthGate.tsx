import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { hasAuthParams, useAuth } from 'react-oidc-context'
import type { EstadoLogin } from './user-manager.ts'

function PantallaCarga({ mensaje }: { mensaje: string }) {
  return (
    <Center h="100vh">
      <Stack align="center" gap="sm">
        <Loader />
        <Text c="dimmed">{mensaje}</Text>
      </Stack>
    </Center>
  )
}

/**
 * Exige una sesión de Keycloak para ver la aplicación. Sin sesión, redirige al
 * login guardando la ruta pedida para volver a ella al regresar.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const redirigiendo = useRef(false)

  useEffect(() => {
    // No redirigir mientras se procesa la vuelta desde Keycloak (?code=...).
    if (
      !hasAuthParams() &&
      !auth.isAuthenticated &&
      !auth.activeNavigator &&
      !auth.isLoading &&
      !auth.error &&
      !redirigiendo.current
    ) {
      redirigiendo.current = true
      const estado: EstadoLogin = {
        returnTo: window.location.pathname + window.location.search,
      }
      void auth.signinRedirect({ state: estado })
    }
  }, [auth])

  if (auth.error) {
    return (
      <Center h="100vh" p="md">
        <Alert
          color="red"
          icon={<IconAlertTriangle />}
          title="No se pudo conectar con Keycloak"
          maw={480}
        >
          <Stack gap="sm">
            <Text size="sm">{auth.error.message}</Text>
            <Button variant="light" color="red" onClick={() => void auth.signinRedirect()}>
              Reintentar
            </Button>
          </Stack>
        </Alert>
      </Center>
    )
  }

  if (!auth.isAuthenticated) {
    return <PantallaCarga mensaje="Conectando con el inicio de sesión…" />
  }

  return children
}
