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
import type { ConfigCatalogo } from './config-catalogo.ts'
import { TablaCatalogo } from './TablaCatalogo.tsx'

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
  ],
  useLista: useCategorias,
  useGuardar: useGuardarCategoria,
  useEliminar: useEliminarCategoria,
} satisfies ConfigCatalogo<
  { id: number; nombre: string; descripcion: string; admiteAccesoLogico: boolean; admiteAccesoFisico: boolean },
  { nombre: string; descripcion: string; admiteAccesoLogico: boolean; admiteAccesoFisico: boolean }
>

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
          solicitudes de acceso lógico o físico (Control de acceso); la sincronización con GLPI no lo cambia.
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
