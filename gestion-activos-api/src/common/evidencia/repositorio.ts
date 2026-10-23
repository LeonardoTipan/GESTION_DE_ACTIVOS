import { BadRequestException } from '@nestjs/common';

/**
 * «Repositorio verificable» (mantenimiento y vulnerabilidades): dónde está guardada
 * la evidencia. Puede ser una carpeta compartida o una ruta (no siempre es una URL
 * pública); la aplicación no almacena archivos ni los sirve. Si parece una URL,
 * debe ser http(s) válida (nada de javascript:, file:…).
 */
export function exigirRepositorioValido(repositorio: string | null | undefined): void {
  if (!repositorio) return;
  // Sin esquema (o una letra de unidad, C:\…): ruta o carpeta compartida.
  if (!/^[a-z][a-z0-9+.-]+:/i.test(repositorio)) return;
  let url: URL;
  try {
    url = new URL(repositorio);
  } catch {
    throw new BadRequestException('El repositorio del verificable no es una URL válida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('El repositorio del verificable solo admite URL http o https, o una carpeta compartida.');
  }
}
