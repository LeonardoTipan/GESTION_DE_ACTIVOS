import { Badge, Button, Card, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconCalendarPlus, IconClockPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { AmpliarPlazoModal, VentanaModal } from '../../../shared/plazos/componentes.tsx'
import { fmt } from '../../../shared/plazos/plazos.ts'
import { usePuedeAdministrar, usePuedeOperar } from '../../auth/use-puede.ts'
import {
  useAmpliarPlazoVulnerabilidad,
  useProgramarVerificacionVulnerabilidad,
  type Vulnerabilidad,
} from '../api/vulnerabilidades.ts'

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

/**
 * Las fechas que nunca se confunden: detección ≠ inicio del tratamiento ≠
 * límite de remediación ≠ ventana de verificación (con su propio plazo).
 */
export function PlazosVulnerabilidad({ vulnerabilidad: v }: { vulnerabilidad: Vulnerabilidad }) {
  const operar = usePuedeOperar()
  const admin = usePuedeAdministrar()
  const ampliar = useAmpliarPlazoVulnerabilidad()
  const programar = useProgramarVerificacionVulnerabilidad()
  const [ampliando, setAmpliando] = useDisclosure()
  const [ampliandoVerif, setAmpliandoVerif] = useDisclosure()
  const [programando, setProgramando] = useDisclosure()

  const vigente = !v.anuladoEn
  const pendiente = v.estado === 'ABIERTA' || v.estado === 'EN_MITIGACION'
  const verificable = vigente && (v.estado === 'EN_MITIGACION' || v.estado === 'MITIGADA')
  // Una ventana ya programada solo la cambia un admin (es mover el plan).
  const puedeProgramar = verificable && operar && (!v.verificacionLimite || admin)
  const verificacionVencida =
    v.estado === 'EN_MITIGACION' && v.verificacionLimite !== null && new Date(v.verificacionLimite) < new Date()

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Plazos: previsto y real</Title>
        <Group gap="xs">
          {admin && vigente && pendiente && v.fechaLimite && (
            <Button size="xs" variant="light" color="orange" leftSection={<IconClockPlus size={14} />} onClick={setAmpliando.open}>
              Ampliar plazo de remediación
            </Button>
          )}
          {puedeProgramar && (
            <Button size="xs" variant="light" leftSection={<IconCalendarPlus size={14} />} onClick={setProgramando.open}>
              {v.verificacionPrevista ? 'Reprogramar verificación' : 'Programar verificación'}
            </Button>
          )}
          {admin && verificable && v.estado === 'EN_MITIGACION' && v.verificacionLimite && (
            <Button size="xs" variant="light" color="orange" leftSection={<IconClockPlus size={14} />} onClick={setAmpliandoVerif.open}>
              Ampliar plazo de verificación
            </Button>
          )}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
        <Dato etiqueta="Detectada (real)">{fmt(v.fecha)}</Dato>
        <Dato etiqueta="Tratamiento previsto">{fmt(v.tratamientoPrevisto)}</Dato>
        <Dato etiqueta="Tratamiento iniciado (real)">{fmt(v.tratamientoIniciadoEn)}</Dato>
        <Dato etiqueta="Límite de remediación">
          {fmt(v.fechaLimite)}
          {v.fechaLimiteOriginal && (
            <Text size="xs" c="dimmed">
              ampliado; original {fmt(v.fechaLimiteOriginal)}
            </Text>
          )}
        </Dato>
        <Dato etiqueta="Verificación prevista">
          {v.verificacionPrevista ? `${fmt(v.verificacionPrevista)} → ${fmt(v.verificacionLimite)}` : 'Sin programar'}
          {verificacionVencida && (
            <Badge color="red" size="sm" mt={4}>
              Verificación vencida
            </Badge>
          )}
        </Dato>
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt="sm">
        La detección la registra una persona (no hay escáner integrado). Las excepciones de plazo quedan en las trazas y en
        cada acción o verificación.
      </Text>

      <AmpliarPlazoModal
        abierto={ampliando}
        onCerrar={setAmpliando.close}
        titulo="Ampliar el plazo de remediación"
        limiteActual={v.fechaLimite}
        enviando={ampliar.isPending}
        onConfirmar={(nuevoLimite, motivo) =>
          ampliar.mutate({ id: v.id, datos: { campo: 'REMEDIACION', nuevoLimite, motivo } }, avisar('Plazo ampliado', setAmpliando.close))
        }
      />
      <AmpliarPlazoModal
        abierto={ampliandoVerif}
        onCerrar={setAmpliandoVerif.close}
        titulo="Ampliar el plazo de verificación"
        limiteActual={v.verificacionLimite}
        enviando={ampliar.isPending}
        onConfirmar={(nuevoLimite, motivo) =>
          ampliar.mutate({ id: v.id, datos: { campo: 'VERIFICACION', nuevoLimite, motivo } }, avisar('Plazo ampliado', setAmpliandoVerif.close))
        }
      />
      <VentanaModal
        abierto={programando}
        onCerrar={setProgramando.close}
        titulo="Programar la verificación"
        explicacion="La verificación tiene su propio plazo: puede quedar después del límite de remediación. No puede empezar antes del inicio del tratamiento."
        prevista={v.verificacionPrevista}
        limite={v.verificacionLimite}
        minimo={v.tratamientoIniciadoEn}
        enviando={programar.isPending}
        onConfirmar={(prevista, limite) => programar.mutate({ id: v.id, prevista, limite }, avisar('Verificación programada', setProgramando.close))}
      />
    </Card>
  )
}
