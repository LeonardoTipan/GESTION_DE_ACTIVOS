import { describe, expect, it } from 'vitest'
import { ApiError, ejecutar, mensajeDeError } from './errores.ts'

describe('mensajeDeError', () => {
  it('usa el mensaje de la API', () => {
    expect(mensajeDeError({ message: 'Ya existe un registro.' })).toBe(
      'Ya existe un registro.',
    )
  })

  it('une los mensajes de validación por campo', () => {
    expect(
      mensajeDeError({ message: ['codigo should not be empty', 'cifrado must be a boolean value'] }),
    ).toBe('codigo should not be empty · cifrado must be a boolean value')
  })

  it('sin cuerpo útil, usa un texto según el código', () => {
    expect(mensajeDeError(undefined, 403)).toMatch(/permiso/)
    expect(mensajeDeError(undefined, 500)).toMatch(/servidor/)
    expect(mensajeDeError(undefined)).toMatch(/No se pudo/)
  })
})

describe('ejecutar', () => {
  const respuesta = (status: number) => new Response(null, { status })

  it('devuelve los datos si la respuesta es correcta', async () => {
    await expect(
      ejecutar(Promise.resolve({ data: { id: 1 }, response: respuesta(200) })),
    ).resolves.toEqual({ id: 1 })
  })

  it('lanza ApiError con el código y el mensaje de la API', async () => {
    const llamada = ejecutar(
      Promise.resolve({
        error: { statusCode: 409, message: 'Código duplicado', error: 'Conflict' },
        response: respuesta(409),
      }),
    )
    await expect(llamada).rejects.toBeInstanceOf(ApiError)
    await expect(llamada).rejects.toMatchObject({
      status: 409,
      message: 'Código duplicado',
    })
  })
})
