import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export type Access =
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'restricted'; requirement: string }
  /** A hand-written handler: the CLI cannot tell how (or whether) it is protected. */
  | { kind: 'custom' }
  | { kind: 'unknown' };

export interface PageRoute {
  url: string;
  file: string;
  /** Where the sign-in requirement comes from. */
  guard: 'page' | 'layout' | 'none';
  access: Access;
}

export interface ApiRoute {
  url: string;
  file: string;
  method: string;
  /** Feature module and export that handles the method, when re-exported. */
  handler: string | null;
  access: Access;
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const posix = (path: string): string => path.split(sep).join('/');

/** `app/(app)/users/[id]/page.tsx` → `/users/[id]` (route groups and parallel slots removed). */
export function urlOf(appDir: string, file: string): string {
  const segments = posix(relative(appDir, dirname(file)))
    .split('/')
    .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return `/${segments.join('/')}`;
}

const quoted = (text: string): string[] =>
  [...text.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!);

/** `{ permission: 'a', anyOf: ['b', 'c'], role: 'ADMIN' }` → "a · any of b | c · role ADMIN". */
export function describeRequirement(body: string): string {
  const field = (name: string): string[] => {
    const match = new RegExp(`${name}:\\s*(\\[[^\\]]*\\]|['"\`][^'"\`]+['"\`])`).exec(body);
    return match ? quoted(match[1]!) : [];
  };
  return [
    field('permission').join(''),
    field('allOf').join(' + '),
    field('anyOf').length ? `any of ${field('anyOf').join(' | ')}` : '',
    field('role').length ? `role ${field('role').join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The access a page declares through `requireUser(...)`, if it calls it. */
export function pageAccess(source: string): Access | null {
  const call = /requireUser\(\s*(?:(\{[\s\S]*?\})\s*)?\)/.exec(source);
  if (!call) return null;
  const requirement = call[1] ? describeRequirement(call[1]) : '';
  return requirement ? { kind: 'restricted', requirement } : { kind: 'signed-in' };
}

const RESOURCE_ACTIONS: Record<string, string> = {
  list: 'read',
  get: 'read',
  create: 'create',
  update: 'update',
  remove: 'delete',
};

/** The text between a call's opening parenthesis (at `start`) and its matching close. */
function callArguments(source: string, start: number): string {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(start, i);
  }
  return source.slice(start);
}

/**
 * How a route-handler export is protected, read from the feature module that
 * defines it. Handlers are built by factories (`apiRoute({ requires })`,
 * `publicApiRoute`, `resourceRoutes(resource, { access })`, …); anything else
 * is reported as custom so a reviewer looks at it.
 */
export function handlerAccess(source: string, name: string): Access {
  const direct = new RegExp(String.raw`export const ${name}\s*=\s*(\w+)(?:<[^(]*>)?\(`).exec(
    source,
  );
  if (direct) return factoryAccess(source, direct[1]!, direct.index + direct[0].length);

  for (const group of source.matchAll(/export const \{([^}]+)\}\s*=\s*resourceRoutes[^(]*\(/g)) {
    const access = resourceRouteAccess(source, group, name);
    if (access) return access;
  }

  if (new RegExp(String.raw`export (async )?function ${name}\b`).test(source)) {
    return { kind: 'custom' };
  }
  return { kind: 'unknown' };
}

/** `export const GET = factory(…)`: the access the call's options declare. */
function factoryAccess(source: string, factory: string, argumentsStart: number): Access {
  if (/^public/i.test(factory)) return { kind: 'public' };
  // Only this call's own arguments: a neighbouring export must never lend its requirement.
  const call = callArguments(source, argumentsStart);
  const options = factoryOptions(source, call);
  const requires = options ? /requires:\s*(\{[^}]*\})/.exec(options) : null;
  if (requires) {
    const requirement = describeRequirement(requires[1]!);
    return requirement ? { kind: 'restricted', requirement } : { kind: 'signed-in' };
  }
  const access = /access:\s*(\{[^}]*\}|['"`][^'"`]+['"`])/.exec(call);
  if (access) {
    const requirement = access[1]!.startsWith('{')
      ? describeRequirement(access[1]!)
      : quoted(access[1]!).join('');
    if (requirement) return { kind: 'restricted', requirement };
  }
  // An options literal without `requires` means "any signed-in user". What the CLI
  // cannot read is reported as custom — never guessed — so a reviewer looks at it.
  return options !== null && factory.endsWith('Route') ? { kind: 'signed-in' } : { kind: 'custom' };
}

/** First argument: an options literal, or a shared constant (const READ = { requires: … }). */
function factoryOptions(source: string, call: string): string | null {
  if (/^\s*\{/.test(call)) return call.split(/\basync\b|=>/)[0]!;
  const constant = /^\s*([A-Za-z_]\w*)\s*(?:,|$)/.exec(call);
  if (!constant) return null;
  const declared = new RegExp(
    String.raw`const ${constant[1]}\b[^=]*=\s*(\{[\s\S]*?\})\s*(?:as const)?;`,
  ).exec(source);
  return declared ? declared[1]! : null;
}

/** `export const { list: GET, … } = resourceRoutes(resource, { access })`, if it exports `name`. */
function resourceRouteAccess(source: string, group: RegExpExecArray, name: string): Access | null {
  const entry = group[1]!
    .split(',')
    .map((part) => part.split(':').map((s) => s.trim()))
    .find(([key, alias]) => (alias ?? key) === name);
  if (!entry) return null;
  const rest = source.slice(group.index);
  const access = /access:\s*\{([^}]*)\}/.exec(rest.slice(0, rest.indexOf(');') + 1 || 800));
  const action = RESOURCE_ACTIONS[entry[0]!];
  const permission =
    action && access ? new RegExp(`${action}:\\s*['"\`]([^'"\`]+)`).exec(access[1]!) : null;
  return permission ? { kind: 'restricted', requirement: permission[1]! } : { kind: 'signed-in' };
}

export function describeAccess(access: Access): string {
  switch (access.kind) {
    case 'public':
      return 'public';
    case 'signed-in':
      return 'signed in';
    case 'restricted':
      return access.requirement;
    case 'custom':
      return 'custom handler';
    case 'unknown':
      return 'UNKNOWN';
  }
}

export function scanPages(root: string): PageRoute[] {
  const appDir = join(root, 'src/app');
  const pages = walk(appDir).filter((file) => /[\\/]page\.tsx?$/.test(file));
  return pages
    .map((file): PageRoute => {
      const own = pageAccess(readFileSync(file, 'utf8'));
      let inherited: Access | null = null;
      for (let dir = dirname(file); dir.startsWith(appDir); dir = dirname(dir)) {
        const layout = ['layout.tsx', 'layout.ts'].map((n) => join(dir, n)).find(existsSync);
        if (layout) inherited ??= pageAccess(readFileSync(layout, 'utf8'));
        if (dir === appDir) break;
      }
      return {
        url: urlOf(appDir, file),
        file: posix(relative(root, file)),
        guard: guardOf(own, inherited),
        access: own ?? inherited ?? { kind: 'public' },
      };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

function guardOf(own: Access | null, inherited: Access | null): PageRoute['guard'] {
  if (own) return 'page';
  return inherited ? 'layout' : 'none';
}

export function scanApiRoutes(root: string): ApiRoute[] {
  const appDir = join(root, 'src/app');
  const read = moduleReader(root);
  const routes: ApiRoute[] = [];
  for (const file of walk(join(appDir, 'api')).filter((f) => /[\\/]route\.ts$/.test(f))) {
    const url = urlOf(appDir, file);
    const rel = posix(relative(root, file));
    const seen = new Set<string>();
    for (const { method, handler, access } of exportedHandlers(file, read)) {
      if (!HTTP_METHODS.has(method) || seen.has(method)) continue;
      seen.add(method);
      routes.push({ url, file: rel, method, handler, access });
    }
  }
  return routes.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
}

type ModuleReader = (specifier: string, from: string) => string | null;

/** Reads the module an import specifier points at (cached; null when it does not exist). */
function moduleReader(root: string): ModuleReader {
  const sources = new Map<string, string>();
  return (specifier, from) => {
    const base = specifier.startsWith('@/')
      ? join(root, 'src', specifier.slice(2))
      : resolve(dirname(from), specifier);
    const path = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(existsSync);
    if (!path) return null;
    if (!sources.has(path)) sources.set(path, readFileSync(path, 'utf8'));
    return sources.get(path)!;
  };
}

interface ExportedHandler {
  method: string;
  handler: string | null;
  access: Access;
}

/** Everything a route file exports that may be a method handler (re-exports first). */
function exportedHandlers(file: string, read: ModuleReader): ExportedHandler[] {
  const source = readFileSync(file, 'utf8');
  const found = [...source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].flatMap(
    (block) => reExportedHandlers(block, read(block[2]!, file)),
  );
  for (const inline of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    found.push({ method: inline[1]!, handler: null, access: { kind: 'custom' } });
  }
  for (const inline of source.matchAll(/export\s+const\s+(\w+)\s*=/g)) {
    found.push({ method: inline[1]!, handler: null, access: handlerAccess(source, inline[1]!) });
  }
  const destructured = /export\s+const\s+\{([^}]+)\}\s*=/.exec(source);
  for (const name of destructured?.[1]!.split(',').map((s) => s.trim()) ?? []) {
    found.push({ method: name, handler: null, access: { kind: 'custom' } });
  }
  return found;
}

/** `export { GET, handler as POST } from '@/features/x/api/…'`. */
function reExportedHandlers(
  block: RegExpExecArray,
  handlerSource: string | null,
): ExportedHandler[] {
  const found: ExportedHandler[] = [];
  for (const part of block[1]!.split(',')) {
    // `name` or `name as alias`.
    const [name, keyword, alias] = part.trim().split(/\s+/);
    if (!name) continue;
    found.push({
      method: keyword === 'as' && alias ? alias : name,
      handler: `${block[2]!.replace(/^@\/features\//, '')}#${name}`,
      access: handlerSource ? handlerAccess(handlerSource, name) : { kind: 'unknown' },
    });
  }
  return found;
}
