/**
 * Datos iniciales de los catálogos (idempotente: se puede ejecutar varias veces).
 * Ejecutar con: npx prisma db seed
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const CRITICIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];

const CATEGORIAS = [
  {
    nombre: 'Hardware',
    descripcion:
      'Equipos físicos: servidores, estaciones de trabajo, periféricos.',
  },
  {
    nombre: 'Software',
    descripcion: 'Aplicaciones, sistemas operativos y licencias.',
  },
  {
    nombre: 'Información',
    descripcion: 'Bases de datos, documentos y repositorios de información.',
  },
  {
    nombre: 'Red',
    descripcion:
      'Equipos y enlaces de comunicaciones: switches, routers, firewalls.',
  },
  {
    nombre: 'Servicio',
    descripcion: 'Servicios internos o de terceros (correo, nube, hosting).',
  },
];

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Falta DATABASE_URL en el entorno.');
}
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

try {
  for (const nivel of CRITICIDADES) {
    await prisma.criticidad.upsert({
      where: { nivel },
      update: {},
      create: { nivel },
    });
  }
  for (const categoria of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria,
    });
  }
  console.log(
    `Seed aplicado: ${CRITICIDADES.length} criticidades y ${CATEGORIAS.length} categorías.`,
  );
} finally {
  await prisma.$disconnect();
}
