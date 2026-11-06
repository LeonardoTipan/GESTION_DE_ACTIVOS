import { Badge, Button, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useState } from 'react'
import { BitacoraGeneral, SelectorAnioBitacora } from '../../../shared/bitacora/BitacoraGeneral.tsx'
import { CampoBusqueda } from '../../../shared/bitacora/CampoBusqueda.tsx'
import { TarjetaListado } from '../../../shared/components/TarjetaListado.tsx'
import { formatearFecha, hoyLocal } from '../../../shared/formato.ts'
import { TrazasModal } from '../../../shared/registro/componentes.tsx'
import { useBitacoraEspecificaRespaldos, useBitacoraGeneralRespaldos, type FilaBitacoraRespaldo } from '../api/respaldos.ts'
import { COLOR_RESULTADO, ETIQUETAS_RESPALDO, RESULTADO } from '../catalogos.ts'

type Situacion = FilaBitacoraRespaldo['situacion']
const SITUACION: Record<Situacion, { etiqueta: string; color: string; ayuda: string }> = {
  CUMPLIDA: { etiqueta: 'Validada', color: 'green', ayuda: 'Cubierta por una ejecución EXITOSA: cuenta en el numerador.' },
  VENCIDA: { etiqueta: 'No validada', color: 'red', ayuda: 'Terminó sin ejecución exitosa: cuenta solo en el total programado.' },
  EN_CURSO: { etiqueta: 'En curso', color: 'blue', ayuda: 'Todavía no termina: no cuenta hasta cerrarse o cubrirse.' },
  PROGRAMADA: { etiqueta: 'Programada', color: 'gray', ayuda: 'Futura.' },
}

const resultado = (r: string) => (
  <Badge size="sm" variant="light" color={COLOR_RESULTADO[r as keyof typeof COLOR_RESULTADO] ?? 'gray'}>{RESULTADO[r as keyof typeof RESULTADO] ?? r}</Badge>
)
const dimmed = (t = '—') => <Text size="sm" c="dimmed">{t}</Text>

function TablaBitacora({ filas, onHistorial }: { filas: FilaBitacoraRespaldo[]; onHistorial: (f: FilaBitacoraRespaldo) => void }) {
  return (
    <Table.ScrollContainer minWidth={1500}>
      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sistema respaldado</Table.Th>
            <Table.Th>Ventana programada</Table.Th>
            <Table.Th>Situación</Table.Th>
            <Table.Th>Fecha de ejecución</Table.Th>
            <Table.Th>Resultado</Table.Th>
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Evidencia de la copia</Table.Th>
            <Table.Th>Prueba de restauración</Table.Th>
            <Table.Th>Acta de restauración</Table.Th>
            <Table.Th>Historial</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((f) => (
            <Table.Tr key={`${f.planId}-${f.ini}`}>
              <Table.Td>
                <Text size="sm" fw={500}>{f.activo.codigo}</Text>
                <Text size="xs" c="dimmed" maw={220}>{f.activo.nombre}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{f.etiqueta}</Text>
                {f.ini !== f.fin && <Text size="xs" c="dimmed">{formatearFecha(f.ini)} – {formatearFecha(f.fin)}</Text>}
              </Table.Td>
              <Table.Td>
                <Badge variant="light" color={SITUACION[f.situacion].color} title={SITUACION[f.situacion].ayuda}>{SITUACION[f.situacion].etiqueta}</Badge>
              </Table.Td>
              <Table.Td>{f.ejecucion ? formatearFecha(f.ejecucion.fecha) : dimmed('Sin ejecución')}</Table.Td>
              <Table.Td>
                {f.ejecucion ? resultado(f.ejecucion.resultado) : dimmed()}
                {f.noValidas > 0 && f.ejecucion?.resultado === 'EXITOSO' && <Text size="xs" c="dimmed">+{f.noValidas} no válida(s)</Text>}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{f.ejecucion?.responsable ?? f.responsablePlan}</Text>
                {!f.ejecucion && <Text size="xs" c="dimmed">del plan</Text>}
              </Table.Td>
              <Table.Td>{f.ejecucion?.evidencia ? <Text size="sm" maw={180} lineClamp={2} title={f.ejecucion.evidencia}>{f.ejecucion.evidencia}</Text> : dimmed()}</Table.Td>
              <Table.Td>
                {f.restauracion ? (
                  <>
                    {resultado(f.restauracion.resultado)}
                    <Text size="xs" c="dimmed">
                      {f.restauracion.resultado === 'EXITOSO' ? 'Aprobada el ' : 'El '}
                      {formatearFecha(f.restauracion.fecha)}
                    </Text>
                  </>
                ) : (
                  dimmed('Sin prueba')
                )}
              </Table.Td>
              <Table.Td>{f.restauracion ? <Text size="sm" maw={200} lineClamp={2} title={f.restauracion.evidencia}>{f.restauracion.evidencia}</Text> : dimmed()}</Table.Td>
              <Table.Td>
                {f.ejecucion ? (
                  <Button size="compact-xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => onHistorial(f)}>
                    Ver
                  </Button>
                ) : (
                  dimmed()
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Paso «Bitácora» (solo consulta): la Bitácora General MENSUAL del Excel (ventanas validadas
 * por una ejecución EXITOSA ÷ ventanas programadas) y la Específica, una fila por ventana con
 * la copia y su prueba de restauración por separado.
 */
export function BitacoraRespaldos() {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | undefined>()
  const [situacion, setSituacion] = useState<Situacion | undefined>()
  const [q, setQ] = useState<string | undefined>()
  const [responsable, setResponsable] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [historial, setHistorial] = useState<FilaBitacoraRespaldo | null>(null)
  const general = useBitacoraGeneralRespaldos(anio)
  const especifica = useBitacoraEspecificaRespaldos({ anio, mes, situacion, q, responsable, page, limit: 20 })
  const etiquetaMes = mes ? general.data?.periodos[mes - 1]?.etiqueta : undefined
  const con = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1) }

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={con(setAnio)} />
        <Select
          label="Mes"
          placeholder="Año entero"
          clearable
          data={(general.data?.periodos ?? []).map((p, i) => ({ value: String(i + 1), label: p.etiqueta }))}
          value={mes ? String(mes) : null}
          onChange={(v) => con(setMes)(v ? Number(v) : undefined)}
          w={{ base: '100%', sm: 160 }}
        />
      </Group>
      <BitacoraGeneral consulta={general} seleccionado={mes} onSeleccionar={con(setMes)} />

      <div>
        <Title order={4}>Bitácora Específica · {etiquetaMes ? `${etiquetaMes} ${anio}` : `año ${anio}`}</Title>
        <Text size="sm" c="dimmed">
          Una fila por ventana programada: la ejecución que la valida (o la última registrada) y, aparte, su prueba de restauración.
          Los registros anulados no aparecen. Para corregir un dato, use el paso de Ejecución o de Restauración: el cambio queda en su historial.
        </Text>
      </div>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <CampoBusqueda label="Buscar" placeholder="Código o nombre del sistema" valor={q} onCambio={con(setQ)} />
        <Select
          label="Situación"
          placeholder="Todas"
          clearable
          data={(Object.keys(SITUACION) as Situacion[]).map((s) => ({ value: s, label: SITUACION[s].etiqueta }))}
          value={situacion ?? null}
          onChange={(v) => con(setSituacion)((v as Situacion | null) ?? undefined)}
          w={{ base: '100%', sm: 160 }}
        />
        <CampoBusqueda label="Responsable" placeholder="Infraestructura" valor={responsable} onCambio={con(setResponsable)} />
      </Group>
      <TarjetaListado
        consulta={especifica}
        pagina={page}
        onPagina={setPage}
        tituloError="No se pudo cargar la Bitácora Específica"
        vacio={<Text c="dimmed">No hay ventanas programadas en este período con esos filtros.</Text>}
      >
        {(filas) => <TablaBitacora filas={filas} onHistorial={setHistorial} />}
      </TarjetaListado>
      <TrazasModal
        abierto={historial?.ejecucion != null}
        entidad="EJECUCION_RESPALDO"
        registroId={historial?.ejecucion?.id ?? 0}
        titulo={historial ? `Historial de la ejecución del ${formatearFecha(historial.ejecucion?.fecha ?? '')} · ${historial.activo.codigo}` : ''}
        etiquetas={ETIQUETAS_RESPALDO}
        onCerrar={() => setHistorial(null)}
      />
    </Stack>
  )
}
