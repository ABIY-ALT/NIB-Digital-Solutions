import type { AccessRequirement } from '@/features/auth/permissions';
import type { Resource } from '@/shared/data/resource';
import { toListQuery } from '@/shared/types';
import { apiRoute, listParamsOf, parseWith, readJson } from './api-route';

type Schema<T> = Parameters<typeof parseWith<T>>[0];

export interface ResourceRoutesConfig<TCreate, TUpdate> {
  /** Permission (or full requirement) per operation — the UX gate; the backend still decides. */
  access: {
    read: AccessRequirement;
    create?: AccessRequirement;
    update?: AccessRequirement;
    delete?: AccessRequirement;
  };
  /** Request-body schemas (validated in the BFF before anything reaches the backend). */
  schemas?: { create?: Schema<TCreate>; update?: Schema<TUpdate> };
  /** Success messages (standard envelope `message`). */
  messages?: { created?: string; updated?: string; deleted?: string };
}

const seg = (id: string) => encodeURIComponent(id);
const CHANGE_REASON = 'x-change-reason';

/** Maker's justification for maker–checker changes (forwarded as-is, URI-encoded). */
const reasonHeader = (request: Request) => {
  const value = request.headers.get(CHANGE_REASON);
  return value ? { [CHANGE_REASON]: value.slice(0, 3000) } : undefined;
};

/** 202 = the backend queued the change for approval: keep its status and message. */
const outcome = <T>(res: { data: T; status: number; message: string | null }, message?: string) =>
  res.status === 202
    ? { data: res.data, status: 202, message: res.message }
    : { data: res.data, message: message ?? res.message };
const req = (r: AccessRequirement | string) => (typeof r === 'string' ? { permission: r } : r);

/**
 * Standard CRUD route handlers for a resource: BFF ⇄ backend pass-through with
 * validation, list-query bounding, idempotency forwarding and the standard envelope.
 *
 *   export const { list, get, create, update, remove } = resourceRoutes(rolesResource, {
 *     access: { read: 'roles:read', create: 'roles:create', update: 'roles:update', delete: 'roles:delete' },
 *     schemas: { create: createBody, update: updateBody },
 *   });
 *
 * Wire them from thin files: app/api/roles/route.ts → `export { list as GET, create as POST }`.
 * Anything non-standard stays a hand-written apiRoute next to these.
 */
export function resourceRoutes<T, TCreate = unknown, TUpdate = unknown>(
  resource: Resource<T>,
  config: Omit<ResourceRoutesConfig<TCreate, TUpdate>, 'access'> & {
    access: {
      read: AccessRequirement | string;
      create?: AccessRequirement | string;
      update?: AccessRequirement | string;
      delete?: AccessRequirement | string;
    };
  },
) {
  const base = resource.backendPath;
  const { access, schemas = {}, messages = {} } = config;
  const denied = { requires: { permission: '__never__' } } as const; // operation not exposed

  return {
    list: apiRoute<T[]>({ requires: req(access.read) }, async ({ req: request, api }) => {
      const res = await api.get<T[]>(base, {
        query: toListQuery(listParamsOf(request, resource.listDefaults)),
      });
      return { data: res.data, meta: res.meta };
    }),

    get: apiRoute<T, { id: string }>({ requires: req(access.read) }, async ({ api, params }) => ({
      data: (await api.get<T>(`${base}/${seg(params.id)}`)).data,
    })),

    create: apiRoute<T>(
      access.create ? { requires: req(access.create) } : denied,
      async ({ req: request, api }) => {
        const body = schemas.create
          ? await readJson(request, parseWith(schemas.create))
          : await readJson(request, (v) => v);
        const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;
        const res = await api.post<T>(base, body, {
          idempotencyKey,
          headers: reasonHeader(request),
        });
        return res.status === 202
          ? outcome(res)
          : { data: res.data, status: 201, message: messages.created ?? null };
      },
    ),

    update: apiRoute<T, { id: string }>(
      access.update ? { requires: req(access.update) } : denied,
      async ({ req: request, api, params }) => {
        const body = schemas.update
          ? await readJson(request, parseWith(schemas.update))
          : await readJson(request, (v) => v);
        const res = await api.patch<T>(`${base}/${seg(params.id)}`, body, {
          headers: reasonHeader(request),
        });
        return outcome(res, messages.updated);
      },
    ),

    remove: apiRoute<T, { id: string }>(
      access.delete ? { requires: req(access.delete) } : denied,
      async ({ req: request, api, params }) => {
        const version = new URL(request.url).searchParams.get('version');
        const query = version && /^\d+$/.test(version) ? { version } : undefined;
        const res = await api.delete<T>(`${base}/${seg(params.id)}`, {
          query,
          headers: reasonHeader(request),
        });
        return outcome(res, messages.deleted);
      },
    ),
  };
}
