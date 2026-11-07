import 'reflect-metadata';
import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Version,
  VERSION_NEUTRAL,
  type INestApplicationContext,
} from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Audit, Idempotent, Public } from '#core/presentation/decorators/metadata.decorators.js';
import { AuthRateLimit } from '#core/presentation/decorators/rate-limit.decorators.js';
import {
  AuthenticatedOnly,
  RequireAnyPermission,
  RequirePermissions,
  RequireRoles,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { collectRoutes, describeAccess, isWrite, type RouteInfo } from './routes.js';

@Controller('widgets')
@RequirePermissions('widgets:read')
class WidgetsController {
  @Get()
  list() {}

  @Post()
  @RequirePermissions('widgets:create')
  @Audit({ action: 'widgets.create', resourceType: 'Widget' } as never)
  @Idempotent()
  create() {}

  @Patch(':id')
  @RequireAnyPermission('widgets:update', 'widgets:admin')
  @RequireRoles('ops')
  update() {}

  helper() {}
}

class BaseController {
  @Get('inherited')
  @AuthenticatedOnly()
  inherited() {}

  @Get('overridden')
  overridden() {}
}

@Controller({ path: ['auth', 'session'], version: '2' })
class AuthController extends BaseController {
  @Post('login')
  @Public()
  @AuthRateLimit()
  login() {}

  @Delete('nothing')
  undeclared() {}

  override overridden() {}
}

@Controller()
class HealthController {
  @Get(['health', 'health/live'])
  @Version(VERSION_NEUTRAL)
  @Public()
  health() {}
}

function appWith(...controllers: Array<abstract new (...args: never[]) => object>) {
  const modules = new Map([
    ['m1', { controllers: new Map(controllers.map((c, i) => [`c${i}`, { metatype: c }])) }],
    ['m2', { controllers: new Map([['none', { metatype: null }]]) }],
  ]);
  return {
    get: (token: unknown) => {
      expect(token).toBe(ModulesContainer);
      return modules;
    },
  } as unknown as INestApplicationContext;
}

const settings = { apiPrefix: 'api', defaultVersion: '1', unprefixed: ['health', 'health/live'] };

describe('collectRoutes', () => {
  const routes = collectRoutes(
    appWith(WidgetsController, AuthController, HealthController),
    settings,
  );
  const find = (method: string, path: string) =>
    routes.find((r) => r.method === method && r.path === path) as RouteInfo;

  it('lists every endpoint with its full, versioned path, sorted', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/v1/widgets',
      'POST /api/v1/widgets',
      'PATCH /api/v1/widgets/:id',
      'GET /api/v2/auth/inherited',
      'POST /api/v2/auth/login',
      'DELETE /api/v2/auth/nothing',
      'GET /api/v2/session/inherited',
      'POST /api/v2/session/login',
      'DELETE /api/v2/session/nothing',
      'GET /health',
      'GET /health/live',
    ]);
  });

  it('reads the access, audit, idempotency and rate-limit metadata', () => {
    expect(find('GET', '/api/v1/widgets').access).toEqual({
      kind: 'restricted',
      all: ['widgets:read'],
      any: [],
      roles: [],
    });
    const create = find('POST', '/api/v1/widgets');
    expect(create.access).toMatchObject({ all: ['widgets:create'] });
    expect(create.audit).toBe('widgets.create');
    expect(create.idempotent).toBe(true);
    expect(find('PATCH', '/api/v1/widgets/:id').access).toMatchObject({
      any: ['widgets:update', 'widgets:admin'],
      roles: ['ops'],
    });

    const login = find('POST', '/api/v2/auth/login');
    expect(login.access).toEqual({ kind: 'public' });
    expect(login.authRateLimit).toBe(true);
    expect(login.audit).toBeNull();
    expect(find('GET', '/api/v2/auth/inherited').access).toEqual({ kind: 'authenticated' });
    expect(find('DELETE', '/api/v2/auth/nothing').access).toEqual({ kind: 'denied' });
    // The override has no route metadata of its own: it hides the inherited route.
    expect(find('GET', '/api/v2/auth/overridden')).toBeUndefined();
    expect(find('GET', '/health').controller).toBe('HealthController');
  });

  it('tells writes from reads', () => {
    expect(isWrite(find('POST', '/api/v1/widgets'))).toBe(true);
    expect(isWrite(find('GET', '/api/v1/widgets'))).toBe(false);
  });
});

describe('describeAccess', () => {
  it('summarises each kind of access', () => {
    expect(describeAccess({ kind: 'public' })).toBe('public');
    expect(describeAccess({ kind: 'authenticated' })).toBe('signed in');
    expect(describeAccess({ kind: 'denied' })).toMatch(/DENIED/);
    expect(
      describeAccess({ kind: 'restricted', all: ['a:read', 'b:read'], any: [], roles: [] }),
    ).toBe('a:read + b:read');
    expect(
      describeAccess({ kind: 'restricted', all: [], any: ['x', 'y'], roles: ['ops', 'dev'] }),
    ).toBe('any of x | y · role ops | dev');
  });
});
