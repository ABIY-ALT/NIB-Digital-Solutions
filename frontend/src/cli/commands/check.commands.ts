import type { CliCommand } from '../kernel/command';
import { ExitCode } from '../kernel/errors';
import type { Output } from '../kernel/output';
import {
  checkAppConfig,
  checkEnvironment,
  checkI18n,
  checkRoutes,
  countOf,
  loadAppConfig,
} from '../support/checks';
import { describeAccess } from '../support/routes-scan';

/** Prints findings grouped by severity and returns whether the check failed. */
function report(
  out: Output,
  findings: ReadonlyArray<{ level: 'error' | 'warning'; text: string }>,
  strict: boolean,
  verdict: { ok: string; failed: string },
): boolean {
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  if (errors.length) {
    out.heading(`Errors (${errors.length})`);
    for (const f of errors) out.line(`  ${out.paint('✖', 'red')} ${f.text}`);
  }
  if (warnings.length) {
    out.heading(`Warnings (${warnings.length})`);
    for (const f of warnings) out.line(`  ${out.paint('!', 'yellow')} ${f.text}`);
  }
  const failed = errors.length > 0 || (strict && warnings.length > 0);
  out.line();
  if (failed) out.error(verdict.failed);
  else out.success(warnings.length ? `${verdict.ok} (${warnings.length} warning(s))` : verdict.ok);
  return failed;
}

const STRICT = {
  name: 'strict',
  type: 'boolean',
  description: 'Treat warnings as failures',
} as const;

const envCheck: CliCommand = {
  name: 'env:check',
  summary: 'Validate the BFF environment and compare shared secrets with the backend',
  description: [
    'Runs the same validation as the application, without starting Next.js, then reviews',
    'what a schema cannot see: template placeholders, misspelt variables, secrets in',
    'NEXT_PUBLIC_ variables, one secret used twice, and (for production) plain HTTP.',
    '',
    'When the backend environment file is on this machine (../backend/.env) the service',
    'identity, payload key ring, API prefix and single sign-on settings are compared with',
    'it. A mismatch otherwise only shows as failing sign-ins. Secrets are never printed;',
    'short fingerprints are, so two people can compare values.',
    '',
    'Exit code 2 when something is wrong: use it as a deployment gate.',
  ].join('\n'),
  options: [
    { name: 'env-file', type: 'string', valueName: 'path', description: 'Check ONLY this file' },
    {
      name: 'backend-env',
      type: 'string',
      valueName: 'path',
      description: 'Backend environment file to compare with (default: ../backend/.env)',
    },
    { name: 'production', type: 'boolean', description: 'Review as a production environment' },
    STRICT,
  ],
  examples: [
    'env:check',
    'env:check --env-file deploy/production.env --backend-env ../backend/deploy/production.env --production --strict',
  ],
  run({ root, options, out }) {
    const result = checkEnvironment(root, {
      envFile: options.string('env-file'),
      backendEnv: options.string('backend-env'),
      production: options.flag('production'),
    });
    const strict = options.flag('strict');
    const errors = countOf(result.findings, 'error');
    const warnings = countOf(result.findings, 'warning');
    const failed = errors > 0 || (strict && warnings > 0);
    out.emit({ valid: !failed, ...result }, () => {
      out.line(`Environment: ${result.environment}  ·  source: ${result.sources.join(' › ')}`);
      out.line(
        result.comparedWith
          ? `Shared secrets compared with: ${result.comparedWith}`
          : out.paint(
              'Backend environment file not found: shared secrets were not compared.',
              'dim',
            ),
      );
      report(
        out,
        result.findings.map((f) => ({ level: f.level, text: `${f.variable}: ${f.message}` })),
        strict,
        { ok: 'The environment is valid.', failed: 'The environment is not ready.' },
      );
    });
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

const configCheck: CliCommand = {
  name: 'config:check',
  summary: 'Validate app.config.ts against the project (pages, translations, icons, flags)',
  description: [
    'The schema proves the configuration object is well-formed. This proves it points at',
    'things that exist: every navigation link has a page, every label is translated in',
    'every locale, every icon can be rendered, every feature flag is defined.',
  ].join('\n'),
  options: [STRICT],
  examples: ['config:check', 'config:check --json'],
  async run({ root, options, out }) {
    const result = checkAppConfig(root, await loadAppConfig());
    const strict = options.flag('strict');
    const failed =
      countOf(result.findings, 'error') > 0 || (strict && countOf(result.findings, 'warning') > 0);
    out.emit({ valid: !failed, ...result }, () => {
      out.heading('Navigation');
      out.table(
        [
          { header: 'SECTION', value: (n) => n.section },
          { header: 'ITEM', value: (n) => n.id },
          { header: 'LINK', value: (n) => n.href },
          { header: 'PERMISSIONS (ANY)', value: (n) => n.permissions },
          { header: 'FEATURE FLAG', value: (n) => n.feature },
        ],
        result.navigation,
      );
      out.heading('Feature flags');
      out.keyValues(Object.entries(result.features));
      report(
        out,
        result.findings.map((f) => ({ level: f.level, text: `${f.subject}: ${f.message}` })),
        strict,
        {
          ok: 'The application configuration is consistent.',
          failed: 'The configuration has problems.',
        },
      );
    });
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

const i18nCheck: CliCommand = {
  name: 'i18n:check',
  summary: 'Find missing, mismatched and untranslated messages in every locale',
  description: [
    'Compares each catalogue (shared/i18n and features/<feature>/i18n) with the default',
    'locale:',
    '  error    a key without translation, different {placeholders}, a catalogue that is',
    '           not registered in messages.ts, two catalogues with the same namespace',
    '  warning  text still in the default language, keys that only exist in a translation',
    '',
    '--strict also fails on warnings: use it before a release, once translation is done.',
  ].join('\n'),
  options: [
    STRICT,
    {
      name: 'feature',
      type: 'string',
      valueName: 'name',
      description: 'Only this catalogue (a feature name, or "shared")',
    },
  ],
  examples: ['i18n:check', 'i18n:check --feature users', 'i18n:check --strict'],
  async run({ root, options, out }) {
    const { i18n } = await loadAppConfig();
    const result = checkI18n(root, i18n);
    const feature = options.string('feature');
    const folder = feature === 'shared' ? 'shared/i18n' : `features/${feature}/i18n`;
    const findings = feature
      ? result.findings.filter((f) => f.catalogue === folder)
      : result.findings;
    const strict = options.flag('strict');
    const failed = countOf(findings, 'error') > 0 || (strict && countOf(findings, 'warning') > 0);

    out.emit(
      {
        valid: !failed,
        locales: i18n.locales,
        catalogues: result.catalogues,
        keys: result.keys,
        findings,
      },
      () => {
        out.line(
          `${result.catalogues} catalogues · ${result.keys} messages · locales: ${i18n.locales.join(', ')} (default ${i18n.defaultLocale})`,
        );
        // Untranslated text is expected while translators work: summarise it per catalogue.
        const untranslated = new Map<string, number>();
        for (const f of findings.filter((x) => x.problem === 'untranslated')) {
          const key = `${f.catalogue} [${f.locale}]`;
          untranslated.set(key, (untranslated.get(key) ?? 0) + 1);
        }
        const detailed = findings
          .filter((f) => f.problem !== 'untranslated' || out.mode.json || options.flag('verbose'))
          .map((f) => ({
            level: f.level,
            text: `${f.catalogue} [${f.locale}] ${f.key}${f.key ? ' ' : ''}${f.message}`,
          }));
        const summarised = options.flag('verbose')
          ? []
          : [...untranslated].map(([where, count]) => ({
              level: 'warning' as const,
              text: `${where}: ${count} message(s) still in ${i18n.defaultLocale} (--verbose lists them)`,
            }));
        report(out, [...detailed, ...summarised], strict, {
          ok: 'Translations are complete.',
          failed: 'Translations have problems.',
        });
      },
    );
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

const routesList: CliCommand = {
  name: 'routes:list',
  summary: 'List pages and API routes with the access each one requires',
  description: [
    'Pages: the URL, and the requirement of its requireUser() call (in the page or in a',
    'layout above it). API routes: each method, the feature handler behind it and the',
    'requirement declared by its factory (apiRoute, resourceRoutes, …).',
    '',
    'Read statically from the source, for security reviews: "public" pages and "custom',
    'handler" routes are the ones to look at. These checks decide what the UI shows; the',
    'backend enforces access (see the backend CLI: routes:list).',
    '',
    '--check fails (exit 2) when an API route points at a handler that does not exist.',
  ].join('\n'),
  options: [
    { name: 'type', type: 'string', choices: ['pages', 'api'], description: 'Only one kind' },
    {
      name: 'filter',
      type: 'string',
      valueName: 'text',
      description: 'Only URLs containing the text',
    },
    {
      name: 'access',
      type: 'string',
      choices: ['public', 'signed-in', 'restricted', 'custom', 'unknown'],
      description: 'Only routes with this kind of access',
    },
    { name: 'check', type: 'boolean', description: 'Fail when a handler cannot be resolved' },
  ],
  examples: ['routes:list', 'routes:list --type api --access public', 'routes:list --check'],
  run({ root, options, out }) {
    const result = checkRoutes(root);
    const type = options.string('type');
    const filter = options.string('filter')?.toLowerCase();
    const access = options.string('access');
    const keep = (route: { url: string; access: { kind: string } }): boolean =>
      (!filter || route.url.toLowerCase().includes(filter)) &&
      (!access || route.access.kind === access);
    const pages = type === 'api' ? [] : result.pages.filter(keep);
    const api = type === 'pages' ? [] : result.api.filter(keep);

    out.emit({ pages, api, findings: result.findings }, () => {
      if (type !== 'api') {
        out.heading(`Pages (${pages.length})`);
        out.table(
          [
            { header: 'URL', value: (p) => p.url },
            { header: 'ACCESS', value: (p) => describeAccess(p.access), maxWidth: 48 },
            { header: 'CHECKED IN', value: (p) => (p.guard === 'none' ? null : p.guard) },
            { header: 'FILE', value: (p) => p.file.replace(/^src\//, '') },
          ],
          pages,
        );
      }
      if (type !== 'pages') {
        out.heading(`API routes (${api.length})`);
        out.table(
          [
            { header: 'METHOD', value: (r) => r.method },
            { header: 'URL', value: (r) => r.url },
            { header: 'ACCESS', value: (r) => describeAccess(r.access), maxWidth: 48 },
            { header: 'HANDLER', value: (r) => r.handler, maxWidth: 56 },
          ],
          api,
        );
      }
      for (const finding of result.findings) out.error(`${finding.subject}: ${finding.message}`);
    });
    return options.flag('check') && result.findings.length ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

export const checkCommands: CliCommand[] = [envCheck, configCheck, i18nCheck, routesList];
