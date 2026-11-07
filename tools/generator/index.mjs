#!/usr/bin/env node
/**
 * AppCore feature generator — a complete vertical slice in one command.
 *
 *   npm run generate -- feature loan-products \
 *     --fields "code:string:required:unique,name:string:required,rate:number:required,active:boolean,launchedOn:date,notes:text" \
 *     [--label "Loan products"] [--icon FileText] [--dry-run] [--force] [--skip-build]
 *
 *   npm run generate -- remove loan-products      (undo a generated feature)
 *
 * Field spec: <name>:<string|text|int|number|boolean|date>[:required][:unique]
 *
 * Generates (and wires):
 *   backend   Prisma model · entity + repository port · Prisma repository · use cases ·
 *             maker–checker handlers · controller with contract DTO · module · spec ·
 *             app.module registration · permission catalogue
 *   frontend  types (from the contract) · resource · schemas · BFF routes · hooks ·
 *             list page · form dialog · i18n (en/am) · route files · navigation · messages
 *   contract  prisma generate → contracts/openapi.json → src/shared/api/contract.gen.ts
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as B from './backend-templates.mjs';
import * as F from './frontend-templates.mjs';
import { names, parseFields } from './naming.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const MANIFESTS = join(ROOT, 'tools/generator/generated');

const color = (code) => (s) => (process.stdout.isTTY ? `\u001b[${code}m${s}\u001b[0m` : s);
const green = color(32);
const yellow = color(33);
const dim = color(2);
const bold = color(1);

function parseArgs(argv) {
  const [command, name, ...rest] = argv;
  const opts = { command, name };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i++;
    }
  }
  return opts;
}

function usage(message) {
  if (message) console.error(`✖ ${message}\n`);
  console.log(`Usage:
  npm run generate -- feature <plural-kebab-name> --fields "<spec>" [--label "<Title>"] [--icon <LucideName>] [--dry-run] [--force] [--skip-build]
  npm run generate -- remove <plural-kebab-name>

Field spec: name:type[:required][:unique], comma-separated
Types: string, text, int, number, boolean, date
Example:
  npm run generate -- feature loan-products --fields "code:string:required:unique,name:string:required,rate:number:required,active:boolean"`);
  process.exit(message ? 1 : 0);
}

/** Lucide names the navigation can render (the ICONS map in navigation.tsx). */
function navIcons() {
  const src = readFileSync(join(FRONTEND, 'src/shared/layouts/navigation.tsx'), 'utf8');
  const block = src.slice(src.indexOf('const ICONS'), src.indexOf('};', src.indexOf('const ICONS')));
  return [...block.matchAll(/^\s+(\w+),?$/gm)].map((m) => m[1]);
}

// ── Patches: text inserted right before a marker comment (idempotent, reversible) ──

const PATCHES = (n) => [
  {
    file: 'backend/prisma/schema.prisma',
    anchor: null, // append
    text: null, // set later (model)
    // prisma format re-aligns the block, so detect and remove it by its header.
    model: n.Pascal,
  },
  {
    file: 'backend/src/app.module.ts',
    anchor: '\n/**\n * Request pipeline',
    text: `\nimport { ${n.Plural}Module } from './modules/${n.kebab}/${n.kebab}.module.js';`,
  },
  {
    file: 'backend/src/app.module.ts',
    anchor: '    // appcore:modules',
    text: `    ${n.Plural}Module,\n`,
  },
  {
    file: 'backend/src/modules/authorization/domain/permission-catalogue.ts',
    anchor: '  // appcore:permissions',
    text: [
      `  '${n.kebab}:read': 'View ${n.title.toLowerCase()}',`,
      `  '${n.kebab}:create': 'Create ${n.title.toLowerCase()}',`,
      `  '${n.kebab}:update': 'Change ${n.title.toLowerCase()}',`,
      `  '${n.kebab}:delete': 'Delete ${n.title.toLowerCase()}',`,
      '',
    ].join('\n'),
  },
  ...['en', 'am'].map((loc) => ({
    file: 'frontend/src/infrastructure/i18n/messages.ts',
    anchor: `    // appcore:messages:${loc}`,
    text: `    () => import('@/features/${n.kebab}/i18n/${loc}.json'),\n`,
  })),
];

function navPatch(n, icon) {
  return {
    file: 'frontend/src/infrastructure/config/app.config.ts',
    anchor: '        // appcore:nav',
    text: [
      '        {',
      `          id: '${n.kebab}',`,
      `          labelKey: '${n.camelPlural}.nav',`,
      `          href: '/${n.kebab}',`,
      `          icon: '${icon}',`,
      `          permissions: ['${n.kebab}:read'],`,
      '        },',
      '',
    ].join('\n'),
  };
}

/** A Prisma model block with its leading /// doc comments (prisma format re-aligns it). */
const modelBlock = (name) =>
  new RegExp(String.raw`\n(?:///[^\n]*\n)*model ${name} \{[\s\S]*?\n\}\n?`);

function applyPatch(patch, dryRun) {
  const path = join(ROOT, patch.file);
  const src = readFileSync(path, 'utf8');
  if (patch.model ? modelBlock(patch.model).test(src) : src.includes(patch.text.trim())) {
    return 'present';
  }
  let next;
  if (patch.anchor === null) next = `${src.trimEnd()}\n${patch.text}`;
  else {
    if (!src.includes(patch.anchor)) throw new Error(`Marker not found in ${patch.file}: ${JSON.stringify(patch.anchor.trim())}`);
    next = src.replace(patch.anchor, `${patch.text}${patch.anchor}`);
  }
  if (!dryRun) writeFileSync(path, next);
  return 'patched';
}

function revertPatch(patch) {
  const path = join(ROOT, patch.file);
  if (!existsSync(path)) return;
  const src = readFileSync(path, 'utf8');
  const next = patch.model
    ? `${src.replace(modelBlock(patch.model), '\n').trimEnd()}\n`
    : src.replace(`${patch.text}${patch.anchor}`, patch.anchor);
  writeFileSync(path, next);
}

function run(cmd, cwd) {
  console.log(dim(`  $ ${cmd}  (${relative(ROOT, cwd) || '.'})`));
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// ── Commands ─────────────────────────────────────────────────────────────────

function generate(opts) {
  if (!opts.name) usage('Missing feature name');
  const n = names(opts.name, typeof opts.label === 'string' ? opts.label : undefined);
  const fields = parseFields(typeof opts.fields === 'string' ? opts.fields : undefined);
  const icons = navIcons();
  let icon = typeof opts.icon === 'string' ? opts.icon : 'FileText';
  if (!icons.includes(icon)) {
    console.log(yellow(`! Icon "${icon}" is not in the navigation icon map (${icons.join(', ')}); using FileText.`));
    icon = 'FileText';
  }
  const dryRun = !!opts['dry-run'];

  const files = {
    // backend
    [`backend/src/modules/${n.kebab}/domain/${n.singularKebab}.entity.ts`]: B.entity(n, fields),
    [`backend/src/modules/${n.kebab}/domain/${n.singularKebab}.entity.spec.ts`]: B.entitySpec(n, fields),
    [`backend/src/modules/${n.kebab}/domain/${n.singularKebab}.repository.ts`]: B.repositoryPort(n, fields),
    [`backend/src/modules/${n.kebab}/infrastructure/prisma-${n.singularKebab}.repository.ts`]: B.prismaRepository(n, fields),
    [`backend/src/modules/${n.kebab}/application/${n.singularKebab}.use-cases.ts`]: B.useCases(n, fields),
    [`backend/src/modules/${n.kebab}/application/${n.singularKebab}-approval.handlers.ts`]: B.approvalHandlers(n, fields),
    [`backend/src/modules/${n.kebab}/presentation/${n.kebab}.controller.ts`]: B.controller(n, fields),
    [`backend/src/modules/${n.kebab}/${n.kebab}.module.ts`]: B.nestModule(n),
    // frontend
    [`frontend/src/features/${n.kebab}/types.ts`]: F.types(n, fields),
    [`frontend/src/features/${n.kebab}/resource.ts`]: F.resource(n, fields),
    [`frontend/src/features/${n.kebab}/schemas.ts`]: F.schemas(n, fields),
    [`frontend/src/features/${n.kebab}/api/${n.kebab}.routes.ts`]: F.apiRoutes(n, fields),
    [`frontend/src/features/${n.kebab}/hooks/use-${n.kebab}.ts`]: F.hooks(n),
    [`frontend/src/features/${n.kebab}/components/${n.kebab}-page.tsx`]: F.page(n, fields, icon),
    [`frontend/src/features/${n.kebab}/components/${n.singularKebab}-form-dialog.tsx`]: F.formDialog(n, fields, icon),
    [`frontend/src/features/${n.kebab}/i18n/en.json`]: F.i18n(n, fields),
    // Amharic starts as a copy: hand it to translators (keys are identical).
    [`frontend/src/features/${n.kebab}/i18n/am.json`]: F.i18n(n, fields),
    [`frontend/src/app/(app)/${n.kebab}/page.tsx`]: F.appPage(n),
    ...Object.fromEntries(Object.entries(F.routeFiles(n)).map(([k, v]) => [`frontend/${k}`, v])),
  };

  const conflicts = Object.keys(files).filter((f) => existsSync(join(ROOT, f)));
  if (conflicts.length && !opts.force) {
    usage(`These files already exist (use --force to overwrite):\n  ${conflicts.join('\n  ')}`);
  }

  console.log(bold(`\nAppCore generator · feature "${n.kebab}" (${n.Pascal}) · ${fields.length} fields${dryRun ? ' · DRY RUN' : ''}\n`));
  for (const [file, content] of Object.entries(files)) {
    if (!dryRun) {
      mkdirSync(dirname(join(ROOT, file)), { recursive: true });
      writeFileSync(join(ROOT, file), content);
    }
    console.log(`  ${green('create')}  ${file}`);
  }

  const patches = PATCHES(n);
  patches[0].text = B.prismaModel(n, fields);
  patches.push(navPatch(n, icon));
  for (const patch of patches) {
    const result = applyPatch(patch, dryRun);
    console.log(`  ${result === 'patched' ? yellow('update') : dim('exists')}  ${patch.file}`);
  }

  if (!dryRun) {
    mkdirSync(MANIFESTS, { recursive: true });
    writeFileSync(
      join(MANIFESTS, `${n.kebab}.json`),
      `${JSON.stringify({ feature: n.kebab, generatedAt: new Date().toISOString(), fields, icon, files: Object.keys(files), patches }, null, 2)}\n`,
    );
  }

  if (!dryRun && !opts['skip-build']) {
    console.log(bold('\nWiring the contract…'));
    run('npx prisma format', BACKEND);
    run('npx prisma generate', BACKEND);
    run('npx prettier --write "src/modules/' + n.kebab + '/**/*.ts" src/app.module.ts src/modules/authorization/domain/permission-catalogue.ts', BACKEND);
    run('npm run contract:export', BACKEND);
    run('npm run api:generate', FRONTEND);
    run(`npx prettier --write "src/features/${n.kebab}/**/*.{ts,tsx,json}" "src/app/(app)/${n.kebab}/page.tsx" "src/app/api/${n.kebab}/**/*.ts" src/infrastructure/config/app.config.ts src/infrastructure/i18n/messages.ts`, FRONTEND);
  }

  console.log(bold('\nNext steps'));
  console.log(`  1. cd backend && npx prisma migrate dev --name add_${n.table}   ${dim('# create the table')}`);
  console.log(`  2. npm run cli -- permissions:sync                   ${dim('# add the 4 permissions (grant them to roles)')}`);
  console.log(`  3. Restart the backend and frontend; open /${n.kebab}`);
  console.log(`  4. Optional four-eyes control: APPROVAL_ACTIONS=…,${n.kebab}.create,${n.kebab}.update,${n.kebab}.delete`);
  console.log(`  5. Translate frontend/src/features/${n.kebab}/i18n/am.json`);
  console.log(dim(`\n  Undo everything: npm run generate -- remove ${n.kebab}\n`));
}

function remove(opts) {
  if (!opts.name) usage('Missing feature name');
  const manifestPath = join(MANIFESTS, `${opts.name}.json`);
  if (!existsSync(manifestPath)) usage(`No generator manifest for "${opts.name}" (tools/generator/generated/${opts.name}.json)`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const file of manifest.files) {
    rmSync(join(ROOT, file), { force: true });
    console.log(`  ${yellow('delete')}  ${file}`);
  }
  // Remove the now-empty feature/module folders.
  for (const dir of [
    `backend/src/modules/${manifest.feature}`,
    `frontend/src/features/${manifest.feature}`,
    `frontend/src/app/(app)/${manifest.feature}`,
    `frontend/src/app/api/${manifest.feature}`,
  ]) {
    rmSync(join(ROOT, dir), { recursive: true, force: true });
  }
  for (const patch of manifest.patches) {
    revertPatch(patch);
    console.log(`  ${yellow('revert')}  ${patch.file}`);
  }
  rmSync(manifestPath);
  console.log(bold(`\nRemoved "${manifest.feature}". Regenerate the contract: `) + 'cd backend && npx prisma generate && npm run contract:export && cd ../frontend && npm run api:generate');
  console.log(dim('If you already migrated, drop the table with a new migration.\n'));
}

const opts = parseArgs(process.argv.slice(2));
try {
  if (opts.command === 'feature') generate(opts);
  else if (opts.command === 'remove') remove(opts);
  else usage(opts.command ? `Unknown command "${opts.command}"` : undefined);
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
