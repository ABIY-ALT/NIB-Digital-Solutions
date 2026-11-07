#!/usr/bin/env node
/**
 * Shared API contract → TypeScript (no dependencies).
 *
 *   npm run api:generate   ../contracts/openapi.json → src/shared/api/contract.gen.ts
 *   npm run api:check      fails when the generated file is stale (CI / `npm run check`)
 *
 * The backend writes the contract (`npm run contract:export` in backend/) from
 * its controllers and named Zod DTO schemas. This script emits:
 *   • one type per named schema          (Role, ApprovalRequest, …)
 *   • ApiOperations: every endpoint's path params, query, body and response data
 *   • API_ERROR_CODES: the backend error-code catalogue (runtime + type)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../contracts/openapi.json');
const target = resolve(root, 'src/shared/api/contract.gen.ts');
const check = process.argv.includes('--check');

const raw = readFileSync(source, 'utf8');
const doc = JSON.parse(raw);
const schemas = doc.components?.schemas ?? {};
const PREFIX = /^\/api\/v\d+/;

const ident = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key));
const indent = (text, n = 2) => text.replaceAll('\n', `\n${' '.repeat(n)}`);
/** Code-unit order, as sort() without a comparator: the output must not depend on the locale. */
const byCodeUnit = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const PRIMITIVES = new Map([
  ['integer', 'number'],
  ['number', 'number'],
  ['string', 'string'],
  ['boolean', 'boolean'],
  ['null', 'null'],
]);

/** JSON Schema (OpenAPI 3.0 subset produced by Zod) → TypeScript type expression. */
function toTs(s) {
  if (!s || typeof s !== 'object' || Object.keys(s).length === 0) return 'unknown';
  const type = typeOf(s);
  return s.nullable && type !== 'unknown' ? `${type} | null` : type;
}

/** The type of a non-empty schema, ignoring `nullable`. */
function typeOf(s) {
  if (s.$ref) return s.$ref.split('/').pop();
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf).map((x) => toTs(x)).join(' | ');
  if (s.allOf) return s.allOf.map((x) => toTs(x)).join(' & ');
  if (s.type === 'array') {
    const item = toTs(s.items);
    return /[|&]/.test(item) ? `Array<${item}>` : `${item}[]`;
  }
  if (s.type === 'object' || s.properties || s.additionalProperties) return objectTs(s);
  return PRIMITIVES.get(s.type) ?? 'unknown';
}

function objectTs(s) {
  const required = new Set(s.required ?? []);
  const props = Object.entries(s.properties ?? {});
  const extra =
    s.additionalProperties && typeof s.additionalProperties === 'object'
      ? `Record<string, ${toTs(s.additionalProperties)}>`
      : null;
  if (props.length === 0) return extra ?? 'Record<string, unknown>';
  const body = props
    .map(([key, value]) => {
      const doc = value.description ? `/** ${value.description} */\n` : '';
      return `${doc}${ident(key)}${required.has(key) ? '' : '?'}: ${toTs(value)};`;
    })
    .join('\n');
  const literal = `{\n  ${indent(body)}\n}`;
  return extra ? `${literal} & ${extra}` : literal;
}

// ── Named schemas ────────────────────────────────────────────────────────────
const named = Object.keys(schemas).sort(byCodeUnit);
const schemaDecls = named
  .map((name) => {
    const s = schemas[name];
    const ts = toTs(s);
    const doc = s.description ? `/** ${s.description} */\n` : '';
    return ts.startsWith('{') && !s.nullable
      ? `${doc}export interface ${name} ${ts}`
      : `${doc}export type ${name} = ${ts};`;
  })
  .join('\n\n');

// ── Operations ───────────────────────────────────────────────────────────────
const ops = [];
for (const [path, item] of Object.entries(doc.paths ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[method];
    if (!op) continue;
    const key = `${method.toUpperCase()} ${path.replace(PREFIX, '')}`;
    const params = (op.parameters ?? []).filter((p) => p.in === 'path');
    const query = (op.parameters ?? []).filter((p) => p.in === 'query');
    const body = op.requestBody?.content?.['application/json']?.schema;
    const success = Object.entries(op.responses ?? {}).find(([code]) => /^2\d\d$/.test(code));
    const envelope = success?.[1]?.content?.['application/json']?.schema;
    const data = envelope?.properties?.data;
    const paginated = !!envelope?.required?.includes('meta');
    const fields = (list) => list.map((p) => `${ident(p.name)}${p.required ? '' : '?'}: string`);
    const pick = (list) => (list.length ? `{ ${fields(list).join('; ')} }` : 'never');
    ops.push(
      `${JSON.stringify(key)}: {\n` +
        `  /** ${(op.summary ?? '').replaceAll('*/', '')} */\n` +
        `  params: ${pick(params)};\n` +
        `  query: ${pick(query)};\n` +
        `  body: ${body ? indent(toTs(body)) : 'never'};\n` +
        `  data: ${data ? indent(toTs(data)) : 'unknown'};\n` +
        `  paginated: ${paginated};\n` +
        `};`,
    );
  }
}

const errorCodes = schemas.ErrorCode?.enum ?? [];
const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);

const output = `/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit. Source: contracts/openapi.json (backend).
// Regenerate: npm run api:generate · Verify: npm run api:check
// ─────────────────────────────────────────────────────────────────────────────

/** Hash of the contract this file was generated from. */
export const CONTRACT_HASH = '${digest}';

${schemaDecls}

/** Named DTO schemas by name: ApiSchemas['Role']. */
export interface ApiSchemas {
  ${named.map((n) => `${n}: ${n};`).join('\n  ')}
}

/** Every backend endpoint: "<METHOD> <path>" → params, query, body and response data. */
export interface ApiOperations {
  ${indent(ops.join('\n'))}
}

export type ApiOperation = keyof ApiOperations;
/** Response \`data\` of an endpoint, e.g. ApiData<'GET /roles/{id}'>. */
export type ApiData<K extends ApiOperation> = ApiOperations[K]['data'];
/** Request body of an endpoint, e.g. ApiBody<'POST /roles'>. */
export type ApiBody<K extends ApiOperation> = ApiOperations[K]['body'];
export type ApiQuery<K extends ApiOperation> = ApiOperations[K]['query'];

/** Backend error-code catalogue (stable product contract). */
export const API_ERROR_CODES = ${JSON.stringify(errorCodes, null, 2).replaceAll('\n', '\n')} as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
`;

if (check) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    /* missing = stale */
  }
  if (current.replaceAll('\r\n', '\n') !== output) {
    console.error('✖ src/shared/api/contract.gen.ts is out of date. Run `npm run api:generate`.');
    process.exit(1);
  }
  console.log(`✔ API types match the contract (${digest}).`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output);
  console.log(`✔ Generated ${named.length} schemas and ${ops.length} operations → ${target}`);
}
