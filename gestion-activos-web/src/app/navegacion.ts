import {
  IconCategory,
  IconDatabaseExport,
  IconLayoutDashboard,
  IconServer,
  IconShieldExclamation,
  IconTool,
  type Icon,
} from '@tabler/icons-react'
import { tieneRol, type Rol } from '../features/auth/roles.ts'

export interface ItemMenu {
  etiqueta: string
  ruta: string
  icono: Icon
  descripcion: string
  /** Vacío = visible para cualquier usuario autenticado. */
  roles: readonly Rol[]
}

/** Menú principal. Cada entrada corresponde a un módulo de features/. */
export const MENU: readonly ItemMenu[] = [
  {
    etiqueta: 'Panel',
    ruta: '/',
    icono: IconLayoutDashboard,
    descripcion: 'Resumen e indicadores.',
    roles: [],
  },
  {
    etiqueta: 'Inventario',
    ruta: '/activos',
    icono: IconServer,
    descripcion: 'Activos, criticidad, cifrado y bitácora de cambios.',
    roles: [],
  },
  {
    etiqueta: 'Respaldos',
    ruta: '/respaldos',
    icono: IconDatabaseExport,
    descripcion: 'Alcance, ejecución y pruebas de restauración.',
    roles: [],
  },
  {
    etiqueta: 'Mantenimientos',
    ruta: '/mantenimientos',
    icono: IconTool,
    descripcion: 'Programación y seguimiento de mantenimientos.',
    roles: [],
  },
  {
    etiqueta: 'Vulnerabilidades',
    ruta: '/vulnerabilidades',
    icono: IconShieldExclamation,
    descripcion: 'Riesgos, mitigación y plazos (SLA).',
    roles: [],
  },
  {
    etiqueta: 'Catálogos',
    ruta: '/catalogos',
    icono: IconCategory,
    descripcion: 'Categorías y niveles de criticidad.',
    roles: ['admin'],
  },
]

/** Entradas del menú visibles para los roles del usuario. */
export function menuPara(roles: readonly Rol[]): ItemMenu[] {
  return MENU.filter((item) => tieneRol(roles, item.roles))
}
