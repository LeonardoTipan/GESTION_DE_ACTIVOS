import { MantineProvider } from '@mantine/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EnConstruccion, MENSAJE_EN_DESARROLLO } from './EnConstruccion.tsx'

describe('EnConstruccion', () => {
  it('muestra el nombre del módulo y el mensaje exacto', () => {
    expect(MENSAJE_EN_DESARROLLO).toBe('Módulo en desarrollo - Próximamente disponible')
    const html = renderToStaticMarkup(
      <MantineProvider>
        <EnConstruccion modulo="Protección de Endpoints" />
      </MantineProvider>,
    )
    expect(html).toContain('Protección de Endpoints')
    expect(html).toContain('Módulo en desarrollo - Próximamente disponible')
  })
})
