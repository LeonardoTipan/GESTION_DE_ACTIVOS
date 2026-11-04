import { Stack, Tabs, Text, Title } from '@mantine/core'
import { IconCalendarStats, IconNotebook, IconTool } from '@tabler/icons-react'
import { useSearchParams } from 'react-router'
import { BitacoraEndpoints } from './BitacoraEndpoints.tsx'
import { EjecucionEndpoints } from './EjecucionEndpoints.tsx'
import { PlanificacionEndpoints } from './PlanificacionEndpoints.tsx'
import { pestanaDe, type PestanaEndpoints } from './textos.ts'

/**
 * Protección de Endpoints: Planificación (apertura de los meses), Ejecución y cierre (los meses
 * pendientes, cuya ejecución se hace en la ficha del período) y Bitácora (consulta). La pestaña
 * va en la URL, para volver a ella desde la ficha.
 */
export function ProteccionEndpointsPage() {
  const [params, setParams] = useSearchParams()
  const pestana = pestanaDe(params.get('pestana'))
  const ir = (p: PestanaEndpoints) => setParams(p === 'planificacion' ? {} : { pestana: p })

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Protección de Endpoints</Title>
        <Text c="dimmed" size="sm">
          Medición mensual de la cobertura de antivirus/EDR
        </Text>
        <Text c="dimmed" size="xs">
          ISO/IEC 27001:2022 · A.8.7 Protección contra el malware
        </Text>
      </div>

      <Tabs value={pestana} onChange={(v) => ir(pestanaDe(v))}>
        <Tabs.List>
          <Tabs.Tab value="planificacion" leftSection={<IconCalendarStats size={16} />}>
            1 · Planificación
          </Tabs.Tab>
          <Tabs.Tab value="ejecucion" leftSection={<IconTool size={16} />}>
            2 · Ejecución y cierre
          </Tabs.Tab>
          <Tabs.Tab value="bitacora" leftSection={<IconNotebook size={16} />}>
            Bitácora
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {pestana === 'planificacion' && <PlanificacionEndpoints />}
      {pestana === 'ejecucion' && <EjecucionEndpoints onIrAPlanificacion={() => ir('planificacion')} />}
      {pestana === 'bitacora' && <BitacoraEndpoints />}
    </Stack>
  )
}
