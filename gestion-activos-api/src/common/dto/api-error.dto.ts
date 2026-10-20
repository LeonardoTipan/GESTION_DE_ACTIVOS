import { ApiProperty } from '@nestjs/swagger';

/** Forma de las respuestas de error de Nest (400, 401, 403, 404...), documentada para el frontend. */
export class ApiErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    description:
      'Mensaje o lista de mensajes (p. ej. errores de validación por campo).',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['nombre should not be empty'],
  })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}
