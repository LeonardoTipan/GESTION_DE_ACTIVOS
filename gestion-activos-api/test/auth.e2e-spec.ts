/**
 * Pruebas e2e de autenticación contra el Keycloak REAL de desarrollo.
 * Requisitos: Keycloak en KEYCLOAK_URL con el realm importado por
 * keycloak/configurar-keycloak.ps1 y KEYCLOAK_TEST_PASSWORD en .env.
 */
import 'dotenv/config';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Roles } from './../src/auth/decorators/roles.decorator.js';

/** Endpoints que solo existen en el test, para comprobar @Roles. */
@Controller('test-roles')
class RolesTestController {
  @Roles('admin')
  @Get('admin')
  soloAdmin() {
    return { ok: true };
  }

  @Roles('admin', 'analista')
  @Get('escritura')
  escritura() {
    return { ok: true };
  }
}

async function getToken(
  username: string,
  password = process.env.KEYCLOAK_TEST_PASSWORD ?? '',
  realm = process.env.KEYCLOAK_REALM ?? '',
  clientId = 'gestion-activos-web',
): Promise<string> {
  const res = await fetch(
    `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username,
        password,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `No se pudo obtener el token de ${username}: HTTP ${res.status}`,
    );
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Cambia un carácter en medio de la firma: el token sigue "bien formado" pero es falso. */
function tamper(token: string): string {
  const [header, payload, signature] = token.split('.');
  const i = Math.floor(signature.length / 2);
  const swapped = signature[i] === 'A' ? 'B' : 'A';
  return `${header}.${payload}.${signature.slice(0, i)}${swapped}${signature.slice(i + 1)}`;
}

describe('Autenticación con Keycloak (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<'admin' | 'analista' | 'auditor', string> = {
    admin: '',
    analista: '',
    auditor: '',
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RolesTestController],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    tokens.admin = await getToken('admin.test');
    tokens.analista = await getToken('analista.test');
    tokens.auditor = await getToken('auditor.test');
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  describe('401: autenticación', () => {
    it('GET /api es público (@Public) y responde sin token', () =>
      get('/api').expect(200));

    it('GET /api/auth/me sin token → 401', () =>
      get('/api/auth/me').expect(401));

    it('token con la firma alterada → 401', () =>
      get('/api/auth/me', tamper(tokens.auditor)).expect(401));

    it('token válido pero de OTRO realm (master) → 401 por issuer', async () => {
      const masterToken = await getToken(
        process.env.KEYCLOAK_ADMIN ?? '',
        process.env.KEYCLOAK_PASSWORD ?? '',
        'master',
        'admin-cli',
      );
      await get('/api/auth/me', masterToken).expect(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('devuelve el usuario del token solo con roles de la aplicación', async () => {
      const res = await get('/api/auth/me', tokens.auditor).expect(200);
      expect(res.body).toMatchObject({
        username: 'auditor.test',
        email: 'auditor.test@gestion-activos.local',
        roles: ['auditor'],
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('403: autorización por rol', () => {
    it('auditor → endpoint @Roles(admin) → 403', () =>
      get('/api/test-roles/admin', tokens.auditor).expect(403));

    it('analista → endpoint @Roles(admin) → 403', () =>
      get('/api/test-roles/admin', tokens.analista).expect(403));

    it('admin → endpoint @Roles(admin) → 200', () =>
      get('/api/test-roles/admin', tokens.admin).expect(200));

    it('analista → endpoint @Roles(admin, analista) → 200', () =>
      get('/api/test-roles/escritura', tokens.analista).expect(200));

    it('auditor → endpoint @Roles(admin, analista) → 403', () =>
      get('/api/test-roles/escritura', tokens.auditor).expect(403));
  });
});
