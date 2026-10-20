import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Traduce los errores conocidos de Prisma a respuestas HTTP con la misma
 * forma que el resto de errores de la API ({ statusCode, message, error }).
 * Sin este filtro, un código duplicado llegaría al frontend como un 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const [statusCode, message] = this.map(exception);
    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error: HttpStatus[statusCode]
        .split('_')
        .map((w) => w[0] + w.slice(1).toLowerCase())
        .join(' '),
    });
  }

  private map(e: Prisma.PrismaClientKnownRequestError): [HttpStatus, string] {
    switch (e.code) {
      case 'P2002': // Violación de restricción única
        return [
          HttpStatus.CONFLICT,
          'Ya existe un registro con ese valor único (p. ej. el mismo código o nombre).',
        ];
      case 'P2003': // Clave foránea: el registro está referenciado o la referencia no existe
        return [
          HttpStatus.CONFLICT,
          'La operación viola una relación con otros registros.',
        ];
      case 'P2025': // Registro no encontrado
        return [HttpStatus.NOT_FOUND, 'El registro solicitado no existe.'];
      default:
        return [
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error interno del servidor.',
        ];
    }
  }
}
