import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@ApiTags('estado')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Comprobación de disponibilidad',
    description: 'Endpoint público: no requiere token.',
  })
  @ApiOkResponse({ schema: { type: 'string', example: 'Hello World!' } })
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
