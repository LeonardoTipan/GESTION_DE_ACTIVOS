import { Anchor, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import type { ReactNode } from 'react'

/** Dato de solo lectura: etiqueta en versalitas y valor (respeta los saltos de línea). */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text component="div" size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {children}
      </Text>
    </div>
  )
}

/** Repositorio del verificable: si es una URL http(s), enlace; si es una carpeta, texto. */
export function EnlaceRepositorio({ valor }: { valor: string | null }) {
  if (!valor) return <>—</>
  return /^https?:\/\//i.test(valor) ? (
    <Anchor href={valor} target="_blank" rel="noopener noreferrer" size="sm">
      {valor}
    </Anchor>
  ) : (
    <>{valor}</>
  )
}

interface ModalReabrirProps {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  explicacion: ReactNode
  /** Regla del motivo del módulo (devuelve el mensaje de error o null). */
  validar: (motivo: string) => string | null
  enviando: boolean
  /** Recibe el motivo ya recortado; el módulo hace la llamada y cierra el modal. */
  onConfirmar: (motivo: string) => void
  etiqueta?: string
  placeholder?: string
}

/** Reabrir con motivo obligatorio. El formulario se vacía cada vez que se abre. */
export function ModalReabrir({ abierto, onCerrar, titulo, ...resto }: ModalReabrirProps) {
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} size="lg">
      <FormReabrir onCerrar={onCerrar} {...resto} />
    </Modal>
  )
}

function FormReabrir({ onCerrar, explicacion, validar, enviando, onConfirmar, etiqueta = 'Motivo', placeholder }: Omit<ModalReabrirProps, 'abierto' | 'titulo'>) {
  const form = useForm({ initialValues: { motivo: '' }, validate: { motivo: validar } })
  return (
    <form onSubmit={form.onSubmit(({ motivo }) => onConfirmar(motivo.trim()))}>
      <Stack gap="sm">
        <Text size="sm">{explicacion}</Text>
        <Textarea label={etiqueta} withAsterisk autosize minRows={3} placeholder={placeholder} {...form.getInputProps('motivo')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar} disabled={enviando}>
            Volver
          </Button>
          <Button type="submit" color="orange" loading={enviando}>
            Reabrir
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
