import { Alert, Badge, Card, Center, Group, Loader, Select, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  aniosBitacora,
  colorPorcentaje,
  ETIQUETA_FRECUENCIA,
  textoPorcentaje,
  textoVariacion,
  variacion,
  type BitacoraIndicador,
} from './bitacora.ts'

/** Selector del año de la bitácora (común a todos los módulos). */
export function SelectorAnioBitacora({ anio, actual, onChange }: { anio: number; actual: number; onChange: (anio: number) => void }) {
  return (
    <Select
      label="Año"
      allowDeselect={false}
      data={aniosBitacora(actual)}
      value={String(anio)}
      onChange={(v) => v && onChange(Number(v))}
      w={{ base: '100%', sm: 120 }}
    />
  )
}

/**
 * Bitácora General con el diseño del Excel: el indicador (nombre, evidencia, fórmula y
 * frecuencia) y una columna por período con numerador, denominador, porcentaje y variación.
 * Las cifras vienen del backend, sin recalcular. Al pulsar un período se elige para la
 * Bitácora Específica (si el módulo lo permite).
 */
export function BitacoraGeneral({
  consulta,
  seleccionado,
  onSeleccionar,
}: {
  consulta: UseQueryResult<BitacoraIndicador, Error>
  /** Índice (1…n) del período elegido; undefined = año entero. */
  seleccionado?: number
  onSeleccionar?: (periodo: number | undefined) => void
}) {
  if (consulta.error) return <Alert color="red" title="No se pudo calcular la Bitácora General">{consulta.error.message}</Alert>
  if (!consulta.data) return <Center py="md"><Loader size="sm" /></Center>
  const { indicador, periodos, informativas } = consulta.data
  const elegible = onSeleccionar !== undefined
  const fondo = (i: number) => (seleccionado === i + 1 ? 'var(--mantine-color-blue-light)' : undefined)
  const celda = (i: number, contenido: ReactNode, extra?: object) => (
    <Table.Td
      key={periodos[i].clave}
      ta="center"
      bg={fondo(i)}
      style={elegible ? { cursor: 'pointer' } : undefined}
      onClick={elegible ? () => onSeleccionar(seleccionado === i + 1 ? undefined : i + 1) : undefined}
      {...extra}
    >
      {contenido}
    </Table.Td>
  )
  const cifra = (v: number | null) => (v === null ? <Text span c="dimmed">—</Text> : v)

  return (
    <Card withBorder padding="lg">
      <Stack gap={6} mb="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Title order={4}>{indicador.nombre}</Title>
          <Badge variant="light">{ETIQUETA_FRECUENCIA[indicador.frecuencia]}</Badge>
        </Group>
        <Text size="sm"><b>Fórmula:</b> {indicador.formula}</Text>
        <Text size="sm"><b>Evidencia:</b> {indicador.evidencia}</Text>
        <Text size="xs" c="dimmed"><b>Criterio aplicado:</b> {indicador.criterio}</Text>
      </Stack>
      <Table.ScrollContainer minWidth={periodos.length > 4 ? 1100 : 600}>
        <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Bitácora General {consulta.data.anio}</Table.Th>
              {periodos.map((p, i) => (
                <Table.Th key={p.clave} ta="center" bg={fondo(i)}>
                  {p.etiqueta}
                  {p.situacion === 'EN_CURSO' && (
                    <Badge size="xs" variant="light" color="blue" display="block" mx="auto" mt={2}>en curso</Badge>
                  )}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td fw={500}>{indicador.numerador}</Table.Td>
              {periodos.map((p, i) => celda(i, cifra(p.numerador)))}
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={500}>{indicador.denominador}</Table.Td>
              {periodos.map((p, i) => celda(i, cifra(p.denominador)))}
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={700}>Cumplimiento</Table.Td>
              {periodos.map((p, i) =>
                celda(
                  i,
                  p.situacion === 'FUTURO' ? (
                    <Text span c="dimmed">—</Text>
                  ) : (
                    <Badge variant="light" color={colorPorcentaje(p.porcentaje)}>{textoPorcentaje(p.porcentaje)}</Badge>
                  ),
                ),
              )}
            </Table.Tr>
            <Table.Tr>
              <Table.Td c="dimmed">Variación con el período anterior</Table.Td>
              {periodos.map((_, i) => celda(i, <Text span size="xs" c="dimmed">{textoVariacion(variacion(periodos, i))}</Text>))}
            </Table.Tr>
            {informativas.map((f) => (
              <Table.Tr key={f.etiqueta}>
                <Table.Td c="dimmed">
                  {f.descripcion ? (
                    <Tooltip label={f.descripcion} multiline w={280}>
                      <Text span size="sm" td="underline dotted">{f.etiqueta}</Text>
                    </Tooltip>
                  ) : (
                    f.etiqueta
                  )}
                </Table.Td>
                {f.valores.map((v, i) => celda(i, <Text span size="sm" c="dimmed">{v ?? '—'}</Text>))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="xs">
        N/D: sin denominador en el período. Las filas en gris son informativas: no forman parte de la fórmula.
        {elegible && ' Pulse un período para ver sus registros en la Bitácora Específica.'}
      </Text>
    </Card>
  )
}
