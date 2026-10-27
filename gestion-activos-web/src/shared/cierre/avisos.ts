import { notifications } from '@mantine/notifications'

/** Aviso verde tras una acción de ejecución o cierre. */
export const avisoExito = (titulo: string, mensaje: string) => notifications.show({ color: 'green', title: titulo, message: mensaje })

/** onError de una mutación: aviso rojo con el mensaje de la API. */
export const avisoFallo = (titulo: string) => (e: Error) => notifications.show({ color: 'red', title: titulo, message: e.message })
