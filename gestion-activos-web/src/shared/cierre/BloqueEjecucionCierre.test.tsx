import { MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BloqueEjecucionCierre, type BloqueEjecucionCierreProps } from './BloqueEjecucionCierre.tsx'

// CampoMotivoCambio vive junto a componentes que usan el cliente de la API (y este, la
// sesión OIDC del navegador); aquí solo se presenta, así que se aíslan esos módulos.
vi.mock('../../api/client.ts', () => ({ api: {} }))
vi.mock('../../features/auth/use-puede.ts', () => ({ usePuedeAdministrar: () => false, usePuedeOperar: () => false }))

const html = (props: BloqueEjecucionCierreProps) => renderToStaticMarkup(<MantineProvider>{<BloqueEjecucionCierre {...props} />}</MantineProvider>)
const campo = (value: string, error?: ReactNode) => ({ value, onChange: () => undefined, error })
/** Etiqueta → botón: atributos del <button> que contiene ese texto. */
const boton = (marcado: string, texto: string) => {
  const botones = marcado.match(/<button[^>]*>.*?<\/button>/g) ?? []
  const b = botones.find((x) => x.includes(`>${texto}<`))
  if (!b) throw new Error(`No está el botón «${texto}»`)
  return b.slice(0, b.indexOf('>') + 1)
}
const deshabilitado = (b: string) => / disabled=""/.test(b) || /data-disabled="true"/.test(b)

describe('BloqueEjecucionCierre', () => {
  it('presenta lo común: verificable, repositorio, observación y botones, después de los campos propios', () => {
    const m = html({
      children: <p>CAMPO PROPIO</p>,
      verificable: campo('Informe 01'),
      repositorio: campo('Carpeta TICs'),
      observacion: campo(''),
      guardar: { etiqueta: 'Guardar sin cerrar', cargando: false },
      cerrar: { etiqueta: 'Cerrar renovación', cargando: false, onClick: () => undefined },
    })
    for (const t of ['Verificable', 'Repositorio verificable', 'Observación', 'Guardar sin cerrar', 'Cerrar renovación']) expect(m).toContain(t)
    expect(m.indexOf('CAMPO PROPIO')).toBeLessThan(m.indexOf('Verificable'))
    expect(m).toContain('value="Informe 01"')
    expect(m).toContain('value="Carpeta TICs"')
    expect(m).not.toContain('Motivo del cambio')
  })

  it('muestra los mensajes de validación que le pasa el módulo', () => {
    const m = html({ verificable: campo('', 'Obligatorio para cerrar'), repositorio: campo('ftp://x', 'Solo URL http o https, o una carpeta compartida') })
    expect(m).toContain('Obligatorio para cerrar')
    expect(m).toContain('Solo URL http o https, o una carpeta compartida')
  })

  it('respeta etiquetas propias del módulo (p. ej. «Repositorio del verificable» en mantenimiento)', () => {
    expect(html({ repositorio: { ...campo(''), label: 'Repositorio del verificable' } })).toContain('Repositorio del verificable')
  })

  it('sin evidencia (Control de acceso) no inventa campos: solo los propios y la botonera', () => {
    const m = html({ children: <p>Fecha atendida · Resolución</p>, volver: () => undefined, cerrar: { etiqueta: 'Cerrar solicitud', cargando: false } })
    expect(m).not.toContain('Verificable')
    expect(m).not.toContain('Repositorio')
    expect(m).not.toContain('Observación')
    expect(m).toContain('Volver')
    expect(boton(m, 'Cerrar solicitud')).toContain('type="submit"')
  })

  it('no rellena ninguna fecha: la fecha real llega solo por los campos propios del módulo', () => {
    const m = html({ verificable: campo(''), repositorio: campo(''), observacion: campo('') })
    expect(m).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2} \w{3} \d{4}/)
  })

  it('cerrar con onClick no envía el formulario; guardar siempre lo envía', () => {
    const m = html({ guardar: { etiqueta: 'Guardar', cargando: false }, cerrar: { etiqueta: 'Cerrar', cargando: false, onClick: () => undefined } })
    expect(boton(m, 'Guardar')).toContain('type="submit"')
    expect(boton(m, 'Cerrar')).toContain('type="button"')
  })

  it('evita envíos duplicados: mientras una acción está en curso, las demás quedan deshabilitadas', () => {
    const guardando = html({
      volver: () => undefined,
      guardar: { etiqueta: 'Guardar', cargando: true },
      cerrar: { etiqueta: 'Cerrar', cargando: false, onClick: () => undefined },
    })
    expect(deshabilitado(boton(guardando, 'Volver'))).toBe(true)
    expect(deshabilitado(boton(guardando, 'Cerrar'))).toBe(true)

    const cerrando = html({ guardar: { etiqueta: 'Guardar', cargando: false }, cerrar: { etiqueta: 'Cerrar', cargando: true, onClick: () => undefined } })
    expect(deshabilitado(boton(cerrando, 'Guardar'))).toBe(true)

    const libre = html({ guardar: { etiqueta: 'Guardar', cargando: false }, cerrar: { etiqueta: 'Cerrar', cargando: false, onClick: () => undefined } })
    expect(deshabilitado(boton(libre, 'Guardar'))).toBe(false)
    expect(deshabilitado(boton(libre, 'Cerrar'))).toBe(false)
  })

  it('guardar sin cambios queda deshabilitado; la corrección pide el motivo', () => {
    const m = html({ motivoCambio: campo(''), guardar: { etiqueta: 'Guardar corrección', cargando: false, deshabilitado: true, principal: true } })
    expect(m).toContain('Motivo del cambio')
    expect(deshabilitado(boton(m, 'Guardar corrección'))).toBe(true)
  })
})
