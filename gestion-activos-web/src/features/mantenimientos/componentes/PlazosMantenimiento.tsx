import { Alert, Badge, Button, Group, SimpleGrid, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCalendarPlus, IconClockPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { AmpliarPlazoModal, VentanaModal } from '../../../shared/plazos/componentes.tsx'
import { fmt } from '../../../shared/plazos/plazos.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../auth/use-puede.ts'
import {
  useAmpliarPlazoMantenimiento,
  useProgramarVerificacionMantenimiento,
  type Mantenimiento,
  type VerificacionMantenimiento,
} from '../api/mantenimientos.ts'

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text component="div" size="sm">
        {children}
      </Text>
    </div>
  )
}

const avisar = (titulo: string, listo: () => void) => ({
  onSuccess: () => {
    notifications.show({ color: 'green', title: titulo, message: 'El cambio queda en las trazas.' })
    listo()
  },
  onError: (e: Error) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }),
})

/** Capas 1 y 2 · Lo previsto frente a lo real, la excepción si la hubo y la ampliación formal (admin). */
export function PlazoEjecucion({ mantenimiento: m }: { mantenimiento: Mantenimiento }) {
  const admin = usePuedeAdministrar()
  const ampliar = useAmpliarPlazoMantenimiento()
  const [abierto, modal] = useDisclosure()
  const ampliable = admin && !m.anuladoEn && m.fechaLimite !== null && (m.fase === 'PROGRAMADO' || m.fase === 'EN_EJECUCION')

  return (
    <>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Dato etiqueta="Inicio previsto">{fmt(m.fecha)}</Dato>
        <Dato etiqueta="Fecha límite">
          {fmt(m.fechaLimite)}
          {m.fechaLimiteOriginal && (
            <Text size="xs" c="dimmed">
              ampliado; original {fmt(m.fechaLimiteOriginal)}
            </Text>
          )}
        </Dato>
        <Dato etiqueta="Inicio real">{fmt(m.fechaInicio)}</Dato>
        <Dato etiqueta={m.fase === 'CANCELADO' ? 'Cancelado el' : 'Fin real'}>{fmt(m.fechaFin)}</Dato>
      </SimpleGrid>
      {m.fueraDePlazo && (
        <Alert color="orange" title="Ejecutado fuera del intervalo previsto (excepción)">
          {m.motivoExcepcion}
          <Text size="xs" c="dimmed" mt={4}>
            Autorizó {m.excepcionPor}. Las fechas reales se conservan; el plan no se modificó.
          </Text>
        </Alert>
      )}
      {ampliable && (
        <Group>
          <Button size="xs" variant="light" color="orange" leftSection={<IconClockPlus size={14} />} onClick={modal.open}>
            Ampliar plazo
          </Button>
        </Group>
      )}
      <AmpliarPlazoModal
        abierto={abierto}
        onCerrar={modal.close}
        titulo={`Ampliar el plazo del mantenimiento #${m.id}`}
        limiteActual={m.fechaLimite}
        enviando={ampliar.isPending}
        onConfirmar={(nuevoLimite, motivo) =>
          ampliar.mutate({ id: m.id, datos: { campo: 'EJECUCION', nuevoLimite, motivo } }, avisar('Plazo ampliado', modal.close))
        }
      />
    </>
  )
}

/**
 * Capa 3 · Ventana prevista de la verificación, con su propio plazo (no tiene
 * que caber en el de la ejecución). Cambiar una ventana aún sin usar es mover
 * el plan: solo admin; tras una verificación que no lo cerró se programa la siguiente.
 */
export function PlazoVerificacion({ mantenimiento: m, verificaciones }: { mantenimiento: Mantenimiento; verificaciones: VerificacionMantenimiento[] }) {
  const operar = usePuedeOperar()
  const admin = usePuedeAdministrar()
  const programar = useProgramarVerificacionMantenimiento()
  const ampliar = useAmpliarPlazoMantenimiento()
  const [programando, modalProgramar] = useDisclosure()
  const [ampliando, modalAmpliar] = useDisclosure()

  const pendiente = !m.anuladoEn && m.fase === 'FINALIZADO' && m.cierre !== 'CERRADO'
  const sinUsar =
    m.verificacionPrevista !== null &&
    !verificaciones.some((v) => !v.anuladoEn && new Date(v.fecha) >= new Date(m.verificacionPrevista!))
  const puedeProgramar = pendiente && operar && (!sinUsar || admin)
  const vencida = pendiente && sinUsar && m.verificacionLimite !== null && new Date(m.verificacionLimite) < new Date()

  if (m.fase !== 'FINALIZADO') return null
  return (
    <>
      <Group justify="space-between" align="flex-end" mb="sm">
        <Group gap="lg">
          <Dato etiqueta="Verificación prevista">
            {m.verificacionPrevista ? `${fmt(m.verificacionPrevista)} → ${fmt(m.verificacionLimite)}` : 'Sin programar'}
          </Dato>
          {vencida && <Badge color="red">Verificación vencida</Badge>}
        </Group>
        <Group gap="xs">
          {puedeProgramar && (
            <Button size="xs" variant="light" leftSection={<IconCalendarPlus size={14} />} onClick={modalProgramar.open}>
              {m.verificacionPrevista ? 'Reprogramar verificación' : 'Programar verificación'}
            </Button>
          )}
          {pendiente && admin && m.verificacionLimite && (
            <Button size="xs" variant="light" color="orange" leftSection={<IconClockPlus size={14} />} onClick={modalAmpliar.open}>
              Ampliar plazo
            </Button>
          )}
        </Group>
      </Group>
      <VentanaModal
        abierto={programando}
        onCerrar={modalProgramar.close}
        titulo={`Programar la verificación del mantenimiento #${m.id}`}
        explicacion="La verificación tiene su propio plazo; no puede empezar antes del fin del mantenimiento."
        prevista={sinUsar ? m.verificacionPrevista : null}
        limite={sinUsar ? m.verificacionLimite : null}
        minimo={m.fechaFin}
        enviando={programar.isPending}
        onConfirmar={(prevista, limite) =>
          programar.mutate({ id: m.id, prevista, limite }, avisar('Verificación programada', modalProgramar.close))
        }
      />
      <AmpliarPlazoModal
        abierto={ampliando}
        onCerrar={modalAmpliar.close}
        titulo={`Ampliar el plazo de verificación del mantenimiento #${m.id}`}
        limiteActual={m.verificacionLimite}
        enviando={ampliar.isPending}
        onConfirmar={(nuevoLimite, motivo) =>
          ampliar.mutate({ id: m.id, datos: { campo: 'VERIFICACION', nuevoLimite, motivo } }, avisar('Plazo ampliado', modalAmpliar.close))
        }
      />
    </>
  )
}
