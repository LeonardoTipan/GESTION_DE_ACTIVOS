import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'
import { usePuedeAdministrar } from '../../features/auth/use-puede.ts'
import { fechaHoraLocalAIso, isoAFechaHoraLocal } from '../formato.ts'
import { errorMotivo } from '../registro/registro.ts'
import { fmt } from './plazos.ts'


import { instante } from '../zona.ts'
/**
 * Si la fecha real cae fuera de lo previsto: lo avisa y, a un admin, le pide
 * la justificación de la excepción. Otro rol ve que no puede registrarla.
 */
export function CampoExcepcion({ fuera, value, onChange, error }: { fuera: string | null; value: string; onChange: (v: string) => void; error?: string | null }) {
  const admin = usePuedeAdministrar()
  if (!fuera) return null
  return (
    <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="Fuera del intervalo previsto">
      <Stack gap="xs">
        <Text size="sm">{fuera} La fecha real se registra tal cual; el plan no se modifica.</Text>
        {admin ? (
          <Textarea
            label="Justificación de la excepción"
            description="Quedará registrada con su nombre y la fecha."
            autosize
            minRows={2}
            withAsterisk
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            error={error}
          />
        ) : (
          <Text size="sm" fw={500} c={error ? 'red' : undefined}>
            Solo un administrador puede registrarla como excepción, o ampliar antes el plazo.
          </Text>
        )}
      </Stack>
    </Alert>
  )
}

/** Ampliación formal de un plazo (solo admin): nuevo límite posterior al actual y motivo. */
export function AmpliarPlazoModal({
  abierto, onCerrar, titulo, limiteActual, enviando, onConfirmar,
}: {
  abierto: boolean; onCerrar: () => void; titulo: string; limiteActual: string | null; enviando: boolean;
  onConfirmar: (nuevoLimite: string, motivo: string) => void
}) {
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} size="lg">
      {abierto && <FormAmpliar limiteActual={limiteActual} enviando={enviando} onCerrar={onCerrar} onConfirmar={onConfirmar} />}
    </Modal>
  )
}

function FormAmpliar({ limiteActual, enviando, onCerrar, onConfirmar }: { limiteActual: string | null; enviando: boolean; onCerrar: () => void; onConfirmar: (n: string, m: string) => void }) {
  const [nuevo, setNuevo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)
  const errorFecha = !nuevo ? 'Indique el nuevo límite.' : limiteActual && !instante(nuevo).isAfter(instante(limiteActual)) ? 'Debe ser posterior al límite actual.' : null
  const errorMot = errorMotivo(motivo)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setTocado(true)
        if (!errorFecha && !errorMot) onConfirmar(fechaHoraLocalAIso(nuevo!), motivo.trim())
      }}
    >
      <Stack gap="sm">
        <Text size="sm">
          Límite actual: <b>{fmt(limiteActual)}</b>. Se conserva como límite original y el cambio queda en las trazas.
        </Text>
        <DateTimePicker label="Nuevo límite" valueFormat="DD MMM YYYY HH:mm" withAsterisk value={nuevo} onChange={setNuevo} error={tocado ? errorFecha : null} minDate={limiteActual ? isoAFechaHoraLocal(limiteActual) : undefined} />
        <Textarea label="Motivo de la ampliación" withAsterisk autosize minRows={2} value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} error={tocado ? errorMot : null} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" color="orange" loading={enviando}>
            Ampliar plazo
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/** Programar una ventana prevista [inicio, límite] (verificación o prueba de restauración). */
export function VentanaModal({
  abierto, onCerrar, titulo, explicacion, prevista, limite, minimo, enviando, onConfirmar,
}: {
  abierto: boolean; onCerrar: () => void; titulo: string; explicacion: string; prevista?: string | null; limite?: string | null;
  /** La ventana no puede empezar antes de esto (p. ej. el fin de la ejecución). */
  minimo?: string | null; enviando: boolean; onConfirmar: (prevista: string, limite: string) => void
}) {
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} size="lg">
      {abierto && <FormVentana explicacion={explicacion} prevista={prevista} limite={limite} minimo={minimo} enviando={enviando} onCerrar={onCerrar} onConfirmar={onConfirmar} />}
    </Modal>
  )
}

function FormVentana({ explicacion, prevista, limite, minimo, enviando, onCerrar, onConfirmar }: { explicacion: string; prevista?: string | null; limite?: string | null; minimo?: string | null; enviando: boolean; onCerrar: () => void; onConfirmar: (p: string, l: string) => void }) {
  const [p, setP] = useState<string | null>(prevista ? isoAFechaHoraLocal(prevista) : null)
  const [l, setL] = useState<string | null>(limite ? isoAFechaHoraLocal(limite) : null)
  const [tocado, setTocado] = useState(false)
  const errorP = !p ? 'Indique el inicio previsto.' : minimo && instante(p).isBefore(instante(minimo)) ? `No puede ser anterior a ${fmt(minimo)}.` : null
  const errorL = !l ? 'Indique el límite.' : p && instante(l).isBefore(instante(p)) ? 'La fecha límite no puede ser anterior al inicio.' : null
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setTocado(true)
        if (!errorP && !errorL) onConfirmar(fechaHoraLocalAIso(p!), fechaHoraLocalAIso(l!))
      }}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {explicacion}
        </Text>
        <Group grow align="flex-start">
          <DateTimePicker label="Inicio previsto" valueFormat="DD MMM YYYY HH:mm" withAsterisk value={p} onChange={setP} error={tocado ? errorP : null} minDate={minimo ? isoAFechaHoraLocal(minimo) : undefined} />
          <DateTimePicker label="Límite" valueFormat="DD MMM YYYY HH:mm" withAsterisk value={l} onChange={setL} error={tocado ? errorL : null} minDate={p ?? undefined} />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            Programar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
