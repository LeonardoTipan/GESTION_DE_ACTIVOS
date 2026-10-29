import { Stack, Tabs, Text, Title } from '@mantine/core'
import { IconCategory, IconFlame } from '@tabler/icons-react'
import {
  useCategorias,
  useCriticidades,
  useEliminarCategoria,
  useEliminarCriticidad,
  useGuardarCategoria,
  useGuardarCriticidad,
} from '../api/catalogos.ts'
import type { ClaseMantenimiento } from '../../mantenimientos/api/mantenimientos.ts'
import type { ConfigCatalogo } from './config-catalogo.ts'
import { TablaCatalogo } from './TablaCatalogo.tsx'

type DatosCategoria = {
  nombre: string
  descripcion: string
  admiteAccesoLogico: boolean
  admiteAccesoFisico: boolean
  claseMantenimiento: ClaseMantenimiento | null
  aplicaMantenimiento: boolean
  aplicaVulnerabilidad: boolean
  aplicaRenovacion: boolean
  aplicaEvaluacion: boolean
  aplicaEndpoint: boolean
}

const CATEGORIAS = {
  singular: 'categoría',
  campos: [
    { clave: 'nombre', etiqueta: 'Nombre', requerido: true },
    { clave: 'descripcion', etiqueta: 'Descripción', requerido: false, multilinea: true },
    {
      clave: 'admiteAccesoLogico',
      etiqueta: 'Acceso lógico',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Sus activos guardan o dan acceso a información: se ofrecen en las solicitudes de acceso lógico.',
    },
    {
      clave: 'admiteAccesoFisico',
      etiqueta: 'Acceso físico',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Sus activos son tangibles y se ofrecen en las solicitudes de acceso físico.',
    },
    {
      clave: 'claseMantenimiento',
      etiqueta: 'Clase de mantenimiento',
      requerido: false,
      tipo: 'seleccion',
      opciones: [
        { value: 'HARDWARE', label: 'Hardware' },
        { value: 'SOFTWARE', label: 'Software' },
      ],
      sinValor: 'Sin clasificar',
      descripcion:
        'Decide los tipos de mantenimiento de sus activos. Hardware: preventivo, correctivo, predictivo. Software: preventivo, correctivo, perfectivo, adaptativo, evolutivo. Sin clasificar: solo preventivo y correctivo.',
    },
    // Elegibilidad por módulo: sus activos (operativos) se ofrecen en ese módulo y el backend lo valida.
    {
      clave: 'aplicaMantenimiento',
      etiqueta: 'Mantenimientos',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Sus activos operativos se pueden planificar y ejecutar en Mantenimientos.',
    },
    {
      clave: 'aplicaVulnerabilidad',
      etiqueta: 'Vulnerabilidades',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Sus activos operativos admiten vulnerabilidades, sean de hardware o de software.',
    },
    {
      clave: 'aplicaRenovacion',
      etiqueta: 'Renovaciones',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Sus activos operativos admiten renovaciones (licencias, garantías, certificados, contratos).',
    },
    {
      clave: 'aplicaEvaluacion',
      etiqueta: 'Evaluación de sistemas (próximamente)',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Preparada para Evaluación de Sistemas Productivos; el módulo aún no está disponible.',
    },
    {
      clave: 'aplicaEndpoint',
      etiqueta: 'Protección de endpoints (próximamente)',
      requerido: false,
      tipo: 'interruptor',
      descripcion: 'Preparada para Protección de Endpoints; el módulo aún no está disponible.',
    },
  ],
  useLista: useCategorias,
  useGuardar: useGuardarCategoria,
  useEliminar: useEliminarCategoria,
} satisfies ConfigCatalogo<{ id: number } & DatosCategoria, DatosCategoria>

const CRITICIDADES = {
  singular: 'criticidad',
  campos: [{ clave: 'nivel', etiqueta: 'Nivel', requerido: true }],
  useLista: useCriticidades,
  useGuardar: useGuardarCriticidad,
  useEliminar: useEliminarCriticidad,
} satisfies ConfigCatalogo<{ id: number; nivel: string }, { nivel: string }>

/** Gestión de catálogos (solo admin; la ruta está protegida con RequireRole). */
export function CatalogosPage() {
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Catálogos</Title>
        <Text c="dimmed" size="sm">
          Valores que se usan al clasificar los activos. En cada categoría se indica si sus activos admiten
          solicitudes de acceso lógico o físico (Control de acceso), su clase de mantenimiento (hardware o software) y
          en qué módulos se ofrecen (Mantenimientos, Vulnerabilidades, Renovaciones); la sincronización con GLPI no los
          cambia.
        </Text>
      </div>
      <Tabs defaultValue="categorias" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="categorias" leftSection={<IconCategory size={16} />}>
            Categorías
          </Tabs.Tab>
          <Tabs.Tab value="criticidades" leftSection={<IconFlame size={16} />}>
            Niveles de criticidad
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="categorias" pt="md">
          <TablaCatalogo config={CATEGORIAS} />
        </Tabs.Panel>
        <Tabs.Panel value="criticidades" pt="md">
          <TablaCatalogo config={CRITICIDADES} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
