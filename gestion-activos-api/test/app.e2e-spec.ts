/**
 * Pruebas e2e de las bases de la API: prefijo /api, ValidationPipe global y
 * contrato OpenAPI. No necesitan token (usan endpoints @Public de prueba);
 * el test del retorno OAuth2 consulta al Keycloak de desarrollo.
 */
import 'dotenv/config';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { setupSwagger } from './../src/swagger.js';

class CrearPruebaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

/** Endpoints que solo existen en el test, para comprobar el ValidationPipe. */
@Public()
@Controller('test-validacion')
class ValidationTestController {
  @Post()
  crear(@Body() dto: CrearPruebaDto) {
    return { esInstanciaDelDto: dto instanceof CrearPruebaDto, dto };
  }

  @Get(':id')
  porId(@Param('id') id: number) {
    return { id, tipo: typeof id };
  }
}

describe('Bases de la API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('prefijo /api', () => {
    it('GET /api responde (endpoint público)', () =>
      request(app.getHttpServer())
        .get('/api')
        .expect(200)
        .expect('Hello World!'));

    it('GET / sin prefijo ya no existe → 404', () =>
      request(app.getHttpServer()).get('/').expect(404));
  });

  describe('ValidationPipe global', () => {
    const post = (body: object) =>
      request(app.getHttpServer()).post('/api/test-validacion').send(body);

    it('body válido → 201 y se convierte en instancia del DTO', async () => {
      const res = await post({ nombre: 'Servidor', cantidad: 3 }).expect(201);
      expect(res.body).toEqual({
        esInstanciaDelDto: true,
        dto: { nombre: 'Servidor', cantidad: 3 },
      });
    });

    it('propiedad no declarada en el DTO → 400 (forbidNonWhitelisted)', async () => {
      const res = await post({
        nombre: 'Servidor',
        cantidad: 3,
        rol: 'admin',
      }).expect(400);
      expect(res.body.message).toContain('property rol should not exist');
    });

    it('tipo incorrecto o campo vacío → 400 con un mensaje por campo', async () => {
      const res = await post({ nombre: '', cantidad: 'tres' }).expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'nombre should not be empty',
          'cantidad must be an integer number',
        ]),
      );
    });

    it('parámetro de ruta se convierte a su tipo (transform)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-validacion/42')
        .expect(200);
      expect(res.body).toEqual({ id: 42, tipo: 'number' });
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('GET /api/docs-json publica el contrato con /api/auth/me y OAuth2 de Keycloak', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.paths).toHaveProperty('/api/auth/me');
      expect(res.body.paths).toHaveProperty('/api/activos');
      expect(res.body.paths).toHaveProperty('/api/activos/{id}/bitacora');
      expect(res.body.paths).toHaveProperty('/api/categorias');
      expect(res.body.paths).toHaveProperty('/api/criticidades');
      expect(res.body.components.securitySchemes.keycloak.type).toBe('oauth2');
    });

    describe('retorno de OAuth2 (login con Keycloak desde Swagger)', () => {
      const redirectUrl = `${process.env.API_PUBLIC_URL ?? 'http://localhost:3000'}/api/docs/oauth2-redirect.html`;

      it('la UI usa una URL de retorno fija, sin depender de la barra final', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/docs/swagger-ui-init.js')
          .expect(200);
        expect(res.text).toContain(`"oauth2RedirectUrl": "${redirectUrl}"`);
      });

      it('la página de retorno existe', () =>
        request(app.getHttpServer())
          .get('/api/docs/oauth2-redirect.html')
          .expect(200));

      it('Keycloak acepta esa URL como redirect_uri (no "Invalid redirect uri")', async () => {
        const url = new URL(
          `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
        );
        url.search = new URLSearchParams({
          client_id: 'gestion-activos-web',
          response_type: 'code',
          scope: 'openid',
          redirect_uri: redirectUrl,
          code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
          code_challenge_method: 'S256',
        }).toString();
        const res = await fetch(url);
        // 200 = página de login. Ojo: por "http://localhost/*" Keycloak acepta cualquier
        // puerto/ruta en localhost (RFC 8252), así que la RUTA la garantiza el test anterior.
        expect(res.status).toBe(200);
      });
    });

    it('GET /api/docs sirve la interfaz de Swagger', () =>
      request(app.getHttpServer())
        .get('/api/docs')
        .expect(200)
        .expect('Content-Type', /html/));
  });
});
