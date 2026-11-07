import { buildAppConfig } from '#config/app-config.js';
import { envSchema } from '#config/env.schema.js';
import type { CliCommand, OptionSpec } from '../kernel/command.js';
import { ExitCode } from '../kernel/errors.js';
import { adviseEnvironment, type ConfigFinding } from '../support/config-advice.js';
import { loadEnvironment } from '../support/env-files.js';
import { flatten, redactConfig } from '../support/redact.js';

const ENV_FILE: OptionSpec = {
  name: 'env-file',
  type: 'string',
  valueName: 'path',
  description: 'Check ONLY this file (e.g. the production file, from any machine)',
};

const KNOWN_VARIABLES = Object.keys(envSchema.shape);

const configCheck: CliCommand = {
  name: 'config:check',
  summary: 'Validate the environment and review it for production readiness',
  description: [
    'Runs the same validation as application start-up, without starting anything,',
    'then reviews settings that are valid but risky: template placeholders, misspelt',
    'variables, one key reused for two purposes and, for production, unencrypted',
    'connections, development credentials, open documentation and disabled controls.',
    '',
    'Exit code 2 when the environment is invalid (or, with --strict, has warnings):',
    'use it as a deployment gate.',
  ].join('\n'),
  boot: 'none',
  options: [
    ENV_FILE,
    {
      name: 'production',
      type: 'boolean',
      description: 'Review as a production environment (overrides NODE_ENV)',
    },
    { name: 'strict', type: 'boolean', description: 'Treat warnings as failures' },
  ],
  examples: [
    'config:check',
    'config:check --env-file deploy/production.env --production --strict',
    'config:check --json',
  ],
  run({ options, out }) {
    const loaded = loadEnvironment({ cwd: process.cwd(), envFile: options.string('env-file') });
    const raw = {
      ...loaded.raw,
      ...(options.flag('production') ? { NODE_ENV: 'production' } : {}),
    };

    const parsed = envSchema.safeParse(raw);
    const findings: ConfigFinding[] = [
      ...(parsed.success
        ? []
        : parsed.error.issues.map((issue) => ({
            level: 'error' as const,
            variable: issue.path.join('.') || '(environment)',
            message: issue.message,
          }))),
      ...adviseEnvironment(raw, KNOWN_VARIABLES, loaded.fileKeys),
    ];
    const errors = findings.filter((f) => f.level === 'error');
    const warnings = findings.filter((f) => f.level === 'warning');
    const failed = errors.length > 0 || (options.flag('strict') && warnings.length > 0);
    const environment = raw.NODE_ENV ?? 'development';

    out.emit({ valid: !failed, environment, sources: loaded.sources, errors, warnings }, () => {
      out.line(`Environment: ${environment}  ·  source: ${loaded.sources.join(' › ')}`);
      if (errors.length) {
        out.heading(`Errors (${errors.length})`);
        for (const f of errors) out.line(`  ${out.paint('✖', 'red')} ${f.variable}: ${f.message}`);
      }
      if (warnings.length) {
        out.heading(`Warnings (${warnings.length})`);
        for (const f of warnings) {
          out.line(`  ${out.paint('!', 'yellow')} ${f.variable}: ${f.message}`);
        }
      }
      out.line();
      if (failed) out.error('The configuration is not ready.');
      else {
        out.success(
          warnings.length
            ? `The configuration is valid, with ${warnings.length} warning(s).`
            : 'The configuration is valid.',
        );
      }
    });
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

const configShow: CliCommand = {
  name: 'config:show',
  summary: 'Print the effective configuration with every secret removed',
  description:
    'Shows what the application will actually use (defaults included). Keys, secrets and\n' +
    'passwords are replaced by placeholders, so the output is safe to attach to a ticket.',
  boot: 'none',
  options: [
    ENV_FILE,
    {
      name: 'section',
      type: 'string',
      valueName: 'name',
      description: 'Only one section, e.g. auth, securityPolicy, retention',
    },
  ],
  examples: ['config:show', 'config:show --section securityPolicy', 'config:show --json'],
  run({ options, out }) {
    const loaded = loadEnvironment({ cwd: process.cwd(), envFile: options.string('env-file') });
    const parsed = envSchema.safeParse(loaded.raw);
    if (!parsed.success) {
      out.error('The environment is invalid — run config:check for the list of problems.');
      return ExitCode.CHECK_FAILED;
    }
    const config = redactConfig(buildAppConfig(parsed.data)) as Record<string, unknown>;
    const section = options.string('section');
    if (section && !(section in config)) {
      out.error(`Unknown section "${section}". Sections: ${Object.keys(config).join(', ')}`);
      return ExitCode.USAGE;
    }
    const shown = section ? { [section]: config[section] } : config;
    out.emit(shown, () => {
      for (const [name, value] of Object.entries(shown)) {
        out.heading(name);
        out.keyValues(flatten(value));
      }
    });
    return ExitCode.OK;
  },
};

export const configCommands: CliCommand[] = [configCheck, configShow];
