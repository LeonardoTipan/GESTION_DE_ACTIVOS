import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateCriticidadDto {
  @ApiProperty({ example: 'Alta', maxLength: 191 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  nivel: string;
}

export class UpdateCriticidadDto extends PartialType(CreateCriticidadDto) {}

export class CriticidadDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'Alta' })
  nivel: string;
}
