import { createTheme } from '@mantine/core'

/** Tema corporativo: sobrio, con índigo como color principal. */
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '600' },
})
