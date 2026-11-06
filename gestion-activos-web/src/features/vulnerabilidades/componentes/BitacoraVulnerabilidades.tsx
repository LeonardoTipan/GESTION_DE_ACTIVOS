import { Anchor, Badge, Button, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import { useState } from 'react'
import { CampoBusqueda } from '../../../shared/bitacora/CampoBusqueda.tsx'
import { Link } from 'react-router'
import { BitacoraGeneral, SelectorAnioBitacora } from '../../../shared/bitacora/BitacoraGeneral.tsx'
import { EnlaceRepositorio } from '../../../shared/cierre/componentes.tsx'
import { TarjetaListado } from '../../../shared/components/TarjetaListado.tsx'
import { formatearDia, hoyLocal } from '../../../shared/formato.ts'
import { TrazasModal } from '../../../shared/registro/componentes.tsx'
import { useCategorias } from '../../inventario/api/catalogos.ts'
import {
  useBitacoraEspecificaVulnerabilidades,
  useBitacoraGeneralVulnerabilidades,
  type EstadoVulnerabilidad,
  type FilaBitacoraVulnerabilidad,
  type NivelRiesgo,
} from '../api/vulnerabilidades.ts'
import { aConsultaBitacora, type FiltrosVulnerabilidades } from '../filtros-url.ts'
import { ESTADOS, ETIQUETAS_VULNERABILIDAD, INFO_ESTADO, INFO_NIVEL, NIVELES } from '../riesgo.ts'
import { BadgeEstado, BadgeNivel } from './Badges.tsx'

const corto = (t: string | null) =>
  t ? <Text size="sm" lineClamp={2} maw={200} title={t}>{t}</Text> : <Text size="sm" c="dimmed">—</Text>

/** Bitácora Específica: los registros que justifican el indicador (solo lectura). */
function TablaBitacora({ filas, conPeriodo, onHistorial }: { filas: FilaBitacoraVulnerabilidad[]; conPeriodo: boolean; onHistorial: (v: FilaBitacoraVulnerabilidad) => void }) {
  return (
    <Table.ScrollContainer minWidth={1800}>
      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N.º</Table.Th>
            <Table.Th>Activo o sistema</Table.Th>
            <Table.Th>Descripción</Table.Th>
            <Table.Th>Criticidad</Table.Th>
            <Table.Th>Fecha de detección</Table.Th>
            <Table.Th>Fecha límite</Table.Th>
            <Table.Th>Responsable</Table.Th>
            <Table.Th>Fecha real de remediación</Table.Th>
            <Table.Th>Estado</Table.Th>
            {conPeriodo && <Table.Th>En el indicador</Table.Th>}
            <Table.Th>Informe verificable</Table.Th>
            <Table.Th>Repositorio</Table.Th>
            <Table.Th>Observaciones</Table.Th>
            <Table.Th>Historial</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((v) => (
            <Table.Tr key={v.id}>
              <Table.Td>
                <Anchor component={Link} to={`/vulnerabilidades/${v.id}`} fw={600}>#{v.id}</Anchor>
                {v.cve && <Text size="xs" ff="monospace" c="dimmed">{v.cve}</Text>}
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>{v.activo.codigo}</Text>
                <Text size="xs" c="dimmed" maw={200}>{v.activo.nombre}</Text>
              </Table.Td>
              <Table.Td>{corto(v.descripcion)}</Table.Td>
              <Table.Td><BadgeNivel nivel={v.nivelRiesgo} /></Table.Td>
              <Table.Td>{formatearDia(v.fecha)}</Table.Td>
              <Table.Td>{v.fechaLimite ? formatearDia(v.fechaLimite) : <Text size="sm" c="dimmed">Sin plazo</Text>}</Table.Td>
              <Table.Td>{v.responsable ?? '—'}</Table.Td>
              <Table.Td>
                {v.estado === 'REMEDIADO' && v.fechaRemediacion ? formatearDia(v.fechaRemediacion) : <Text size="sm" c="dimmed">No remediada</Text>}
              </Table.Td>
              <Table.Td><BadgeEstado estado={v.estado} /></Table.Td>
              {conPeriodo && (
                <Table.Td>
                  {v.enIndicador === 'REMEDIADA' ? (
                    <Badge color="green" variant="light" title="Remediada con la fecha real dentro del período: cuenta en el numerador">Remediada</Badge>
                  ) : (
                    <Badge color="orange" variant="light" title="Pendiente en el período: solo cuenta en el total identificado">Pendiente</Badge>
                  )}
                </Table.Td>
              )}
              <Table.Td>{corto(v.evidencia)}</Table.Td>
              <Table.Td><EnlaceRepositorio valor={v.repositorioVerificable} /></Table.Td>
              <Table.Td>{corto(v.observacion)}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => onHistorial(v)}>
                  Ver
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Pestaña «3 · Bitácora» (solo consulta): la Bitácora General TRIMESTRAL del Excel
 * (remediadas ÷ total identificados, calculada en el backend) y la Específica, con los
 * registros que forman cada cifra. Se corrige desde la ficha, nunca desde aquí.
 */
export function BitacoraVulnerabilidades({
  filtros,
  actualizar,
}: {
  filtros: FiltrosVulnerabilidades
  actualizar: (cambios: Partial<FiltrosVulnerabilidades>) => void
}) {
  const anioActual = Number(hoyLocal().slice(0, 4))
  const anio = filtros.anio ?? anioActual
  const general = useBitacoraGeneralVulnerabilidades(anio)
  const especifica = useBitacoraEspecificaVulnerabilidades(aConsultaBitacora(filtros, anioActual))
  const categorias = useCategorias()
  const [historial, setHistorial] = useState<FilaBitacoraVulnerabilidad | null>(null)
  const periodo = filtros.trimestre ? general.data?.periodos[filtros.trimestre - 1] : undefined

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <SelectorAnioBitacora anio={anio} actual={anioActual} onChange={(a) => actualizar({ anio: a === anioActual ? undefined : a, page: 1 })} />
        <Select
          label="Trimestre"
          placeholder="Año entero"
          clearable
          data={[1, 2, 3, 4].map((t) => ({ value: String(t), label: general.data?.periodos[t - 1]?.etiqueta ?? `T${t}` }))}
          value={filtros.trimestre ? String(filtros.trimestre) : null}
          onChange={(v) => actualizar({ trimestre: v ? Number(v) : undefined, page: 1 })}
          w={{ base: '100%', sm: 170 }}
        />
      </Group>

      <BitacoraGeneral consulta={general} seleccionado={filtros.trimestre} onSeleccionar={(t) => actualizar({ trimestre: t, page: 1 })} />

      <div>
        <Title order={4}>Bitácora Específica · {periodo ? `${periodo.etiqueta} ${anio}` : `año ${anio}`}</Title>
        <Text size="sm" c="dimmed">
          Las vulnerabilidades que forman el «Total identificados» del período (pendientes en algún momento de él) y si cuentan como
          remediadas. Las anuladas no aparecen. Para corregir un dato, abra la vulnerabilidad: el cambio queda en su historial.
        </Text>
      </div>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <CampoBusqueda label="Buscar" placeholder="Código, sistema, CVE o descripción" valor={filtros.q} onCambio={(q) => actualizar({ q, page: 1 })} />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          data={ESTADOS.map((e) => ({ value: e, label: INFO_ESTADO[e].etiqueta }))}
          value={filtros.estado ?? null}
          onChange={(v) => actualizar({ estado: (v as EstadoVulnerabilidad | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 150 }}
        />
        <Select
          label="Criticidad"
          placeholder="Todas"
          clearable
          data={NIVELES.map((n) => ({ value: n, label: INFO_NIVEL[n].etiqueta }))}
          value={filtros.nivelRiesgo ?? null}
          onChange={(v) => actualizar({ nivelRiesgo: (v as NivelRiesgo | null) ?? undefined, page: 1 })}
          w={{ base: '100%', sm: 140 }}
        />
        <Select
          label="Categoría"
          placeholder="Todas"
          clearable
          searchable
          data={(categorias.data ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
          value={filtros.categoriaId ? String(filtros.categoriaId) : null}
          onChange={(v) => actualizar({ categoriaId: v ? Number(v) : undefined, page: 1 })}
          w={{ base: '100%', sm: 180 }}
        />
        <CampoBusqueda label="Responsable" placeholder="ANALISTA 1" valor={filtros.responsable} onCambio={(responsable) => actualizar({ responsable, page: 1 })} />
      </Group>

      <TarjetaListado
        consulta={especifica}
        pagina={filtros.page}
        onPagina={(page) => actualizar({ page })}
        tituloError="No se pudo cargar la Bitácora Específica"
        vacio={<Text c="dimmed">No hay vulnerabilidades en este período con esos filtros.</Text>}
      >
        {(filas) => <TablaBitacora filas={filas} conPeriodo={filas.some((f) => f.enIndicador !== null)} onHistorial={setHistorial} />}
      </TarjetaListado>

      <TrazasModal
        abierto={historial !== null}
        entidad="VULNERABILIDAD"
        registroId={historial?.id ?? 0}
        titulo={historial ? `Historial de la vulnerabilidad #${historial.id} · ${historial.activo.codigo}` : ''}
        etiquetas={ETIQUETAS_VULNERABILIDAD}
        onCerrar={() => setHistorial(null)}
      />
    </Stack>
  )
}
