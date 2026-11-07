import { z, type ZodType } from 'zod';
import { toOpenApiSchema } from '../pipes/zod-validation.pipe.js';

/**
 * Named API schemas — the backend half of the shared API contract.
 *
 * A response DTO is declared ONCE as a Zod schema. The same declaration gives:
 *   • the TypeScript type the controller returns     (ApiDto<typeof RoleDto>)
 *   • a named OpenAPI component (#/components/schemas/Role)
 *   • the frontend type, generated from openapi.json (`npm run api:generate`)
 *
 *   export const RoleDto = apiSchema('Role', z.object({ id: z.uuid(), ... }));
 *   @ApiEnvelope(200, 'Role', RoleDto)
 *   async get(): Promise<ApiResult<ApiDto<typeof RoleDto>>> { ... }
 *
 * Renaming a field is therefore a compile error on BOTH sides until the
 * frontend is regenerated — drift cannot reach production silently.
 */
export interface ApiSchema<T extends ZodType = ZodType> {
  readonly name: string;
  readonly zod: T;
  /** `{ $ref: '#/components/schemas/<name>' }` for Swagger decorators. */
  readonly ref: { $ref: string };
}

export type ApiDto<S extends ApiSchema> = z.output<S['zod']>;

const registry = new Map<string, ApiSchema>();

export function apiSchema<T extends ZodType>(name: string, zod: T): ApiSchema<T> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`Invalid API schema name "${name}"`);
  const existing = registry.get(name);
  if (existing && existing.zod !== zod) throw new Error(`API schema "${name}" is defined twice`);
  const schema: ApiSchema<T> = { name, zod, ref: { $ref: `#/components/schemas/${name}` } };
  registry.set(name, schema);
  return schema;
}

export function isApiSchema(value: unknown): value is ApiSchema {
  return typeof value === 'object' && value !== null && 'ref' in value && 'zod' in value;
}

/** Every registered schema as OpenAPI components (merged into the Swagger document). */
export function apiSchemaComponents(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    [...registry.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => [s.name, withoutFormatPatterns(toOpenApiSchema(s.zod, 'output'))]),
  );
}

/** `format: date-time` already says it; the generated ISO regex is only noise for clients. */
function withoutFormatPatterns(node: unknown): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>);
    const hasFormat = entries.some(([k]) => k === 'format');
    return Object.fromEntries(
      entries.filter(([k]) => !(hasFormat && k === 'pattern')).map(([k, v]) => [k, walk(v)]),
    );
  };
  return walk(node) as Record<string, unknown>;
}

// ── Reusable field helpers (keep DTO declarations short and consistent) ─────

export const isoDateTime = () => z.iso.datetime({ offset: true });
export const nullableIsoDateTime = () => isoDateTime().nullable();
