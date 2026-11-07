import { RequestMethod, VERSION_NEUTRAL, type INestApplicationContext } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import {
  AUDIT_KEY,
  IDEMPOTENT_KEY,
  IS_PUBLIC_KEY,
  type AuditOptions,
} from '#core/presentation/decorators/metadata.decorators.js';
import { AUTH_RATE_LIMIT_KEY } from '#core/presentation/decorators/rate-limit.decorators.js';
import {
  ANY_PERMISSION_KEY,
  AUTHENTICATED_ONLY_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '#modules/authorization/presentation/authorization.decorators.js';

export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'restricted'; all: string[]; any: string[]; roles: string[] }
  /** No authorization metadata: PermissionsGuard denies every call. */
  | { kind: 'denied' };

export interface RouteInfo {
  method: string;
  path: string;
  controller: string;
  handler: string;
  access: RouteAccess;
  /** Audit action recorded for the endpoint (@Audit), if any. */
  audit: string | null;
  idempotent: boolean;
  authRateLimit: boolean;
}

type Handler = (...args: unknown[]) => unknown;
type Controller = abstract new (...args: never[]) => object;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const isWrite = (route: RouteInfo): boolean => WRITE_METHODS.has(route.method);

function asList<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const join = (...segments: string[]): string =>
  `/${segments
    .flatMap((s) => s.split('/'))
    .filter(Boolean)
    .join('/')}`;

/** Handler metadata wins over controller metadata (Reflector.getAllAndOverride). */
function metadata<T>(key: string, handler: Handler, controller: Controller): T | undefined {
  return (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, controller)) as
    T | undefined;
}

function accessOf(handler: Handler, controller: Controller): RouteAccess {
  if (metadata<boolean>(IS_PUBLIC_KEY, handler, controller)) return { kind: 'public' };
  const all = metadata<string[]>(PERMISSIONS_KEY, handler, controller) ?? [];
  const any = metadata<string[]>(ANY_PERMISSION_KEY, handler, controller) ?? [];
  const roles = metadata<string[]>(ROLES_KEY, handler, controller) ?? [];
  if (all.length || any.length || roles.length) return { kind: 'restricted', all, any, roles };
  if (metadata<boolean>(AUTHENTICATED_ONLY_KEY, handler, controller)) {
    return { kind: 'authenticated' };
  }
  return { kind: 'denied' };
}

export function describeAccess(access: RouteAccess): string {
  switch (access.kind) {
    case 'public':
      return 'public';
    case 'authenticated':
      return 'signed in';
    case 'denied':
      return 'DENIED (no authorization declared)';
    case 'restricted':
      return [
        access.all.join(' + '),
        access.any.length ? `any of ${access.any.join(' | ')}` : '',
        access.roles.length ? `role ${access.roles.join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

interface RouteSettings {
  apiPrefix: string;
  defaultVersion: string;
  unprefixed: readonly string[];
}

/**
 * Every HTTP endpoint with the controls that protect it, read from the same
 * decorator metadata the guards and interceptors enforce — so the listing
 * cannot drift from the running application.
 */
export function collectRoutes(app: INestApplicationContext, settings: RouteSettings): RouteInfo[] {
  const routes = [...controllersOf(app)].flatMap((controller) =>
    controllerRoutes(controller, settings),
  );
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function controllersOf(app: INestApplicationContext): Set<Controller> {
  const controllers = new Set<Controller>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) controllers.add(wrapper.metatype as Controller);
    }
  }
  return controllers;
}

/** Own and inherited methods by name (an override hides the method it overrides). */
function handlersOf(controller: Controller): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  for (
    let proto = controller.prototype as object | null;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const value = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown;
      if (name !== 'constructor' && typeof value === 'function' && !handlers.has(name)) {
        handlers.set(name, value as Handler);
      }
    }
  }
  return handlers;
}

function controllerRoutes(controller: Controller, settings: RouteSettings): RouteInfo[] {
  const declared = asList(Reflect.getMetadata(PATH_METADATA, controller) as string | string[]);
  const controllerPaths = declared.length ? declared : [''];
  const routes: RouteInfo[] = [];
  for (const [name, handler] of handlersOf(controller)) {
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (method === undefined) continue;
    for (const path of handlerPaths(handler, controller, controllerPaths, settings)) {
      routes.push({
        method: RequestMethod[method],
        path,
        controller: controller.name,
        handler: name,
        access: accessOf(handler, controller),
        audit: metadata<AuditOptions>(AUDIT_KEY, handler, controller)?.action ?? null,
        idempotent: metadata(IDEMPOTENT_KEY, handler, controller) !== undefined,
        authRateLimit: metadata<boolean>(AUTH_RATE_LIMIT_KEY, handler, controller) === true,
      });
    }
  }
  return routes;
}

/** Every full path of a handler: controller path × handler path × API version. */
function handlerPaths(
  handler: Handler,
  controller: Controller,
  controllerPaths: readonly string[],
  settings: RouteSettings,
): string[] {
  const versions = asList(
    (Reflect.getMetadata(VERSION_METADATA, handler) ??
      Reflect.getMetadata(VERSION_METADATA, controller) ??
      settings.defaultVersion) as string | symbol | Array<string | symbol>,
  );
  const ownPaths = asList(Reflect.getMetadata(PATH_METADATA, handler) as string | string[]);
  const paths: string[] = [];
  for (const controllerPath of controllerPaths) {
    for (const handlerPath of ownPaths) {
      const local = join(controllerPath, handlerPath);
      const prefix = settings.unprefixed.includes(local.slice(1)) ? '' : settings.apiPrefix;
      for (const version of versions) paths.push(join(prefix, versionSegment(version), local));
    }
  }
  return paths;
}

const versionSegment = (version: string | symbol): string =>
  version === VERSION_NEUTRAL ? '' : `v${String(version)}`;
