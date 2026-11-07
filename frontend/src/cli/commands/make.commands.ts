import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { CliCommand } from '../kernel/command';
import { ExitCode, RefusedError, UsageError } from '../kernel/errors';
import { loadAppConfig, navigationIcons } from '../support/checks';
import { walk } from '../support/routes-scan';
import {
  componentFile,
  insertBeforeMarker,
  messagesFile,
  navigationEntry,
  pageNames,
  routeFile,
  type PageSpec,
} from '../support/scaffold';

const MESSAGES = 'src/infrastructure/i18n/messages.ts';
const APP_CONFIG = 'src/infrastructure/config/app.config.ts';

/** The module that exports requireUser, as an "@/…" specifier (found, not assumed). */
function sessionModule(root: string): string {
  const file = walk(join(root, 'src/features/auth')).find(
    (path) =>
      /\.tsx?$/.test(path) &&
      /export async function requireUser\b/.test(readFileSync(path, 'utf8')),
  );
  if (!file)
    throw new Error('Could not find the module that exports requireUser (src/features/auth).');
  return `@/${relative(join(root, 'src'), file)
    .split(sep)
    .join('/')
    .replace(/\.tsx?$/, '')}`;
}

const makePage: CliCommand = {
  name: 'make:page',
  summary: 'Scaffold a page: route, feature component, translations, navigation entry',
  description: [
    'For pages that are not plain record management (reports, dashboards, workflows).',
    'A full CRUD feature, backend included, comes from the workspace generator instead:',
    '  npm run generate -- feature <name> --fields "…"   (in the appcore root)',
    '',
    'Creates, following the project conventions:',
    '  src/app/(app)/<name>/page.tsx                    server component, access check',
    '  src/features/<name>/components/<name>-page.tsx   client component',
    '  src/features/<name>/i18n/<locale>.json           one file per configured locale',
    'and registers the translations in messages.ts. With --nav it also adds the page to',
    'the navigation in app.config.ts. Existing files are never overwritten without --force.',
  ].join('\n'),
  args: [
    { name: 'name', description: 'Page name in kebab-case, e.g. loan-reports (also its URL)' },
  ],
  options: [
    {
      name: 'title',
      type: 'string',
      valueName: 'text',
      description: 'Page title (default: from the name)',
    },
    {
      name: 'permission',
      type: 'string',
      valueName: 'code',
      description: 'Permission the page requires (default: any signed-in user)',
    },
    { name: 'nav', type: 'boolean', description: 'Add the page to the navigation' },
    {
      name: 'icon',
      type: 'string',
      valueName: 'name',
      default: 'FileText',
      description: 'Lucide icon from the navigation icon map',
    },
    { name: 'dry-run', type: 'boolean', description: 'Show what would be written, write nothing' },
    { name: 'force', type: 'boolean', description: 'Overwrite existing files' },
  ],
  examples: [
    'make:page loan-reports --permission loans:read --nav --icon Wallet',
    'make:page help-centre --title "Help centre" --dry-run',
  ],
  async run({ root, args, options, out }) {
    const names = pageNames(args.name!, options.string('title'));
    const permission = options.string('permission');
    if (permission && !/^[a-z0-9-]+:[a-z0-9-*]+(:[a-z0-9-]+)?$/.test(permission)) {
      throw new UsageError(
        '--permission must look like "resource:action" (e.g. loans:read)',
        'make:page',
      );
    }
    const icon = options.string('icon') ?? 'FileText';
    const icons = navigationIcons(root);
    if (icons && !icons.includes(icon)) {
      throw new UsageError(`--icon must be one of: ${icons.join(', ')}`, 'make:page');
    }
    const dryRun = options.flag('dry-run');
    const { i18n } = await loadAppConfig();
    const spec: PageSpec = { names, permission, icon, sessionModule: sessionModule(root) };

    const files: Record<string, string> = {
      [`src/app/(app)/${names.kebab}/page.tsx`]: routeFile(spec),
      [`src/features/${names.kebab}/components/${names.kebab}-page.tsx`]: componentFile(spec),
      ...Object.fromEntries(
        i18n.locales.map((locale) => [
          `src/features/${names.kebab}/i18n/${locale}.json`,
          messagesFile(spec),
        ]),
      ),
    };
    const conflicts = Object.keys(files).filter((file) => existsSync(join(root, file)));
    if (conflicts.length && !options.flag('force')) {
      throw new RefusedError(
        `These files already exist (--force overwrites them):\n  ${conflicts.join('\n  ')}`,
      );
    }

    // Registrations: computed first, so a missing marker stops the command before anything is written.
    const patches: Record<string, string> = {};
    const patch = (file: string, marker: string, text: string): void => {
      const current = patches[file] ?? readFileSync(join(root, file), 'utf8');
      const next = insertBeforeMarker(current, marker, text);
      if (next === null)
        throw new Error(`Marker "${marker}" not found in ${file}: register the page by hand.`);
      if (next !== current) patches[file] = next;
    };
    for (const locale of i18n.locales) {
      patch(
        MESSAGES,
        `// appcore:messages:${locale}`,
        `    () => import('@/features/${names.kebab}/i18n/${locale}.json'),\n`,
      );
    }
    if (options.flag('nav')) patch(APP_CONFIG, '// appcore:nav', navigationEntry(spec));

    if (!dryRun) {
      for (const [file, content] of Object.entries({ ...files, ...patches })) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), content);
      }
    }

    out.emit(
      {
        dryRun,
        created: Object.keys(files),
        updated: Object.keys(patches),
        url: `/${names.kebab}`,
      },
      () => {
        for (const file of Object.keys(files))
          out.line(`  ${out.paint('create', 'green')}  ${file}`);
        for (const file of Object.keys(patches))
          out.line(`  ${out.paint('update', 'yellow')}  ${file}`);
        out.line();
        if (dryRun) {
          out.info('Dry run: nothing was written.');
          return;
        }
        out.success(`Page /${names.kebab} created.`);
        out.heading('Next steps');
        const steps = [
          ...(i18n.locales.length > 1
            ? [
                `Translate src/features/${names.kebab}/i18n/ (${i18n.locales.filter((l) => l !== i18n.defaultLocale).join(', ')} start as copies)`,
              ]
            : []),
          ...(permission
            ? [
                `Make sure "${permission}" exists in the backend permission catalogue and is granted to a role`,
              ]
            : []),
          ...(options.flag('nav')
            ? []
            : ['Add it to the navigation in app.config.ts (or run again with --nav)']),
          'Check the result: npm run cli -- doctor',
        ];
        steps.forEach((step, index) => out.line(`  ${index + 1}. ${step}`));
      },
    );
    return ExitCode.OK;
  },
};

export const makeCommands: CliCommand[] = [makePage];
