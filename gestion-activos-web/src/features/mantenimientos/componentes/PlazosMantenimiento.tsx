import { Alert, Button, Group, SimpleGrid, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconClockPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { AmpliarPlazoModal } from '../../../shared/plazos/componentes.tsx'
import { fmt } from '../../../shared/plazos/plazos.ts'
import { usePuedeAdministrar } from '../../auth/use-puede.ts'
import {
  useAmpliarPlazoMantenimiento,
  type Mantenimiento,
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
