import { Button, Group, SimpleGrid, Stack, Textarea, TextInput, type TextareaProps, type TextInputProps } from '@mantine/core'
import { IconCircleCheck, IconDeviceFloppy } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { CampoMotivoCambio } from '../registro/componentes.tsx'

/** Botón de guardar: siempre envía el formulario (type="submit"). */
export interface AccionGuardar {
  etiqueta: string
  cargando: boolean
  deshabilitado?: boolean
  /** Botón principal (relleno) en lugar de secundario; p. ej. «Guardar corrección». */
  principal?: boolean
}

/** Botón de cierre: sin onClick envía el formulario; con onClick ejecuta esa acción. */
export interface AccionCerrar {
  etiqueta: string
  cargando: boolean
  onClick?: () => void
  color?: string
  icono?: boolean
}

export interface BloqueEjecucionCierreProps {
  /**
   * Campos propios del módulo, antes de la evidencia: la fecha REAL (la indica el usuario;
   * este bloque nunca la rellena), resolución, condición del equipo, nueva caducidad…
   */
  children?: ReactNode
  /** Campo «Verificable»: props del formulario del módulo (value, onChange, error…). */
  verificable?: TextInputProps
  /** Campo «Repositorio verificable» (carpeta o URL http(s); lo valida el módulo). */
  repositorio?: TextInputProps
  /** Campos propios entre la evidencia y la observación (p. ej. la descripción). */
  detalle?: ReactNode
  observacion?: TextareaProps
  /** Motivo del cambio: solo en correcciones auditadas. */
  motivoCambio?: TextareaProps
  guardar?: AccionGuardar
  cerrar?: AccionCerrar
  /** «Volver» (en modales). */
  volver?: () => void
}

/**
 * Presentación común de la ejecución y el cierre (Control de acceso, Mantenimientos,
 * Vulnerabilidades y Renovaciones): evidencia (verificable y repositorio), observación,
 * motivo de corrección y la botonera Volver / Guardar / Cerrar.
 *
 * Solo presenta: los valores, la validación, los mensajes y las llamadas a la API son
 * del módulo. Mientras una acción está en curso, las demás se deshabilitan para que no
 * se envíe dos veces.
 */
export function BloqueEjecucionCierre({
  children,
  verificable,
  repositorio,
  detalle,
  observacion,
  motivoCambio,
  guardar,
  cerrar,
  volver,
}: BloqueEjecucionCierreProps) {
  const ocupado = Boolean(guardar?.cargando || cerrar?.cargando)
  return (
    <Stack gap="sm">
      {children}
      {(verificable || repositorio) && (
        <SimpleGrid cols={{ base: 1, sm: verificable && repositorio ? 2 : 1 }} spacing="sm">
          {verificable && <TextInput label="Verificable" {...verificable} />}
          {repositorio && <TextInput label="Repositorio verificable" {...repositorio} />}
        </SimpleGrid>
      )}
      {detalle}
      {observacion && <Textarea label="Observación" autosize minRows={1} {...observacion} />}
      {motivoCambio && <CampoMotivoCambio {...motivoCambio} />}
      {(volver || guardar || cerrar) && (
        <Group justify="flex-end" mt="xs">
          {volver && (
            <Button variant="default" onClick={volver} disabled={ocupado}>
              Volver
            </Button>
          )}
          {guardar && (
            <Button
              type="submit"
              variant={guardar.principal ? 'filled' : 'default'}
              leftSection={<IconDeviceFloppy size={16} />}
              loading={guardar.cargando}
              disabled={guardar.deshabilitado || Boolean(cerrar?.cargando)}
            >
              {guardar.etiqueta}
            </Button>
          )}
          {cerrar && (
            <Button
              type={cerrar.onClick ? 'button' : 'submit'}
              color={cerrar.color ?? 'green'}
              leftSection={cerrar.icono === false ? undefined : <IconCircleCheck size={16} />}
              loading={cerrar.cargando}
              disabled={Boolean(guardar?.cargando)}
              onClick={cerrar.onClick}
            >
              {cerrar.etiqueta}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  )
}
