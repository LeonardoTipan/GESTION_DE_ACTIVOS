import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'dayjs/locale/es'
import type { User } from 'oidc-client-ts'
import { AuthProvider } from 'react-oidc-context'
import { RouterProvider } from 'react-router'
import { userManager, type EstadoLogin } from '../features/auth/user-manager.ts'
import { router } from './router.tsx'
import { theme } from './theme.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

/** Al volver de Keycloak: quita ?code=... de la URL y regresa a la ruta pedida. */
function alVolverDeKeycloak(user: User | undefined) {
  const estado = user?.state as EstadoLogin | undefined
  void router.navigate(estado?.returnTo ?? '/', { replace: true })
}

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {/* Calendarios en español, semana desde el lunes. */}
      <DatesProvider settings={{ locale: 'es', firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <AuthProvider userManager={userManager} onSigninCallback={alVolverDeKeycloak}>
          <QueryClientProvider client={queryClient}>
            <ModalsProvider>
              <RouterProvider router={router} />
            </ModalsProvider>
          </QueryClientProvider>
        </AuthProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
