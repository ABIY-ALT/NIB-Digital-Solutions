import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import type { AuditOutcome } from '#core/domain/audit-record.js';
import { AppError } from '#core/domain/errors/app-error.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { closest, findCommandName, parseCommandLine } from './argv.js';
import { GLOBAL_OPTIONS, type BootMode, type CliCommand, type CommandContext } from './command.js';
import { ExitCode, RefusedError, UsageError } from './errors.js';
import { printCommandHelp, printGlobalHelp, type HelpInfo } from './help.js';
import { operatorPrincipal, resolveOperator } from './operator.js';
import { Output, type OutputStreams } from './output.js';
import { confirm, readSecret, type Terminal } from './prompt.js';

export interface BootedApp {
  app: INestApplicationContext;
  config: AppConfig;
  close(): Promise<void>;
}

export interface CliRuntime {
  commands: readonly CliCommand[];
  help: HelpInfo;
  streams: OutputStreams;
  terminal: Terminal;
  env: NodeJS.ProcessEnv;
  /** True when stdout is a terminal (colours). */
  colorSupported: boolean;
  /**
   * Starts the application. Injected, so the kernel never imports the module
   * graph and commands that need nothing (`boot: 'none'`) start instantly.
   */
  boot(mode: Exclude<BootMode, 'none'>, options: { verbose: boolean }): Promise<BootedApp>;
}

const MIN_REASON_LENGTH = 5;

/**
 * Runs one command line and returns the process exit code. Never throws:
 * every failure is reported on stderr and mapped to a documented exit code.
 */
export async function runCli(argv: readonly string[], runtime: CliRuntime): Promise<ExitCode> {
  const wantsJson = argv.includes('--json');
  const color =
    runtime.colorSupported && !argv.includes('--no-color') && !runtime.env.NO_COLOR && !wantsJson;
  const out = new Output(runtime.streams, { json: wantsJson, color });
  const verbose = argv.includes('--verbose') || argv.includes('-v');

  try {
    return await dispatch(argv, runtime, out, verbose);
  } catch (error) {
    return report(error, out, runtime.help, verbose);
  }
}

async function dispatch(
  argv: readonly string[],
  runtime: CliRuntime,
  out: Output,
  verbose: boolean,
): Promise<ExitCode> {
  const { commands, help } = runtime;
  const { name, rest } = findCommandName(argv, GLOBAL_OPTIONS);

  if (!name) {
    if (argv.includes('--version')) {
      out.emit({ version: help.version }, () => out.line(help.version));
      return ExitCode.OK;
    }
    printGlobalHelp(out, commands, help);
    return ExitCode.OK;
  }
  if (name === 'help') {
    const topic = findCommandName(rest, GLOBAL_OPTIONS).name;
    if (!topic) printGlobalHelp(out, commands, help);
    else printCommandHelp(out, lookup(commands, topic), help);
    return ExitCode.OK;
  }

  const command = lookup(commands, name);
  if (rest.includes('--help') || rest.includes('-h')) {
    printCommandHelp(out, command, help);
    return ExitCode.OK;
  }
  const { args, options } = parseCommandLine(rest, {
    command: command.name,
    args: command.args,
    options: [...GLOBAL_OPTIONS, ...(command.options ?? [])],
  });

  const operator = resolveOperator(options.string('operator'), runtime.env);
  const principal = operatorPrincipal(operator);
  const mode = command.boot ?? 'full';
  const booted = mode === 'none' ? null : await runtime.boot(mode, { verbose });

  const target: { resourceId: string | null; metadata: Record<string, unknown> } = {
    resourceId: null,
    metadata: {},
  };
  const notBooted = (): never => {
    throw new Error(`Command "${command.name}" declares boot: 'none' but used the application`);
  };
  const ctx: CommandContext = {
    args,
    options,
    out,
    operator,
    principal,
    actor: { id: operator.id, username: operator.username },
    get app() {
      return booted?.app ?? notBooted();
    },
    get config() {
      return booted?.config ?? notBooted();
    },
    get: <T>(token: unknown): T =>
      (booted?.app ?? notBooted()).get<T>(token as string, { strict: false }),
    auditTarget(resourceId, metadata) {
      target.resourceId = resourceId;
      Object.assign(target.metadata, metadata);
    },
    confirm: (question) => confirm(runtime.terminal, question, options.flag('yes')),
    readSecret: (prompt) => readSecret(runtime.terminal, prompt),
  };

  const reason = options.string('reason')?.trim();
  const breakGlass = options.flag('break-glass');
  // A dry run changes nothing, so it leaves no command record (services still audit what they do).
  const changesData =
    typeof command.mutates === 'function' ? command.mutates(options) : command.mutates !== false;
  const audit =
    command.audit && mode === 'full' && booted && changesData
      ? booted.app.get<AuditLogger>(AUDIT_LOGGER, { strict: false })
      : null;
  const record = async (outcome: AuditOutcome, errorCode: string | null): Promise<void> => {
    if (!audit || !command.audit) return;
    await audit.record({
      action: command.audit.action,
      category: command.audit.category,
      resourceType: command.audit.resourceType ?? null,
      resourceId: target.resourceId,
      outcome,
      errorCode,
      actorId: operator.id,
      actorUsername: operator.username,
      metadata: {
        ...target.metadata,
        channel: 'cli',
        command: command.name,
        // Option NAMES only: values may be sensitive and never reach the audit trail.
        options: options.provided().filter((o) => !['reason', 'operator'].includes(o)),
        osUser: operator.osUser,
        host: operator.host,
        ...(reason ? { reason } : {}),
        ...(breakGlass ? { breakGlass: true } : {}),
      },
    });
  };

  try {
    return await RequestContext.run(
      {
        correlationId: `cli-${randomUUID()}`,
        ipAddress: null,
        userAgent: `appcore-cli/${help.version} (${operator.host})`,
        principal,
        startedAt: Date.now(),
      },
      async () => {
        try {
          await preflight(command, ctx, booted?.config ?? null, { reason, breakGlass });
        } catch (error) {
          // A refused four-eyes bypass is a security event; a declined prompt is not.
          if (error instanceof PolicyRefusal) await record('DENIED', 'CLI_APPROVAL_REQUIRED');
          throw error;
        }
        try {
          const code = (await command.run(ctx)) ?? ExitCode.OK;
          await record(code === ExitCode.OK ? 'SUCCESS' : 'FAILURE', null);
          return code;
        } catch (error) {
          if (!(error instanceof UsageError) && !(error instanceof RefusedError)) {
            await record('FAILURE', error instanceof AppError ? error.code : 'CLI_ERROR');
          }
          throw error;
        }
      },
    );
  } finally {
    await booted?.close();
  }
}

class PolicyRefusal extends RefusedError {}

/** Safety controls that run before a command touches anything. */
async function preflight(
  command: CliCommand,
  ctx: CommandContext,
  config: AppConfig | null,
  flags: { reason: string | undefined; breakGlass: boolean },
): Promise<void> {
  const decide = (setting: CliCommand['mutates'] | CliCommand['destructive']): boolean =>
    typeof setting === 'function' ? setting(ctx.options) : setting === true;
  const mutates = decide(command.mutates);
  const destructive = decide(command.destructive);
  const production = config?.app.isProduction ?? false;

  if (
    mutates &&
    command.approvalAction &&
    config?.approvals.enabled &&
    config.approvals.actions.includes(command.approvalAction) &&
    !flags.breakGlass
  ) {
    throw new PolicyRefusal(
      `"${command.approvalAction}" is under maker–checker control (APPROVAL_ACTIONS): make the change ` +
        'in the application so a second person approves it.\n' +
        '  In an emergency, --break-glass applies it directly and records that in the audit trail.',
    );
  }
  if (mutates && production && (flags.reason?.length ?? 0) < MIN_REASON_LENGTH) {
    throw new RefusedError(
      'Changes in production need --reason "<why>" (for example the change ticket). ' +
        'It is stored with the audit record.',
    );
  }
  if (mutates && production) {
    await ctx.confirm(
      `Run "${command.name}" against PRODUCTION (${config?.app.name ?? 'unknown'}) as ${ctx.operator.username}?`,
    );
  } else if (destructive) {
    await ctx.confirm(`"${command.name}" removes data and cannot be undone.`);
  }
}

function lookup(commands: readonly CliCommand[], name: string): CliCommand {
  const command = commands.find((c) => c.name === name);
  if (command) return command;
  const hint = closest(
    name,
    commands.map((c) => c.name),
  );
  const suggestion = hint ? ` (did you mean "${hint}"?)` : '';
  throw new UsageError(`Unknown command "${name}"${suggestion}`);
}

function report(error: unknown, out: Output, help: HelpInfo, verbose: boolean): ExitCode {
  if (error instanceof UsageError) {
    out.error(error.message);
    const helpCommand = error.command ? `help ${error.command}` : 'help';
    out.note(`  Help: ${help.invocation} ${helpCommand}`);
    return ExitCode.USAGE;
  }
  if (error instanceof RefusedError) {
    out.error(error.message);
    return ExitCode.REFUSED;
  }
  if (error instanceof AppError) {
    out.error(`${error.message} [${error.code}]`);
    if (Array.isArray(error.details)) {
      for (const issue of error.details) out.error(`  ${issue.field}: ${issue.message}`);
    }
    return ExitCode.ERROR;
  }
  const message = error instanceof Error ? error.message : String(error);
  out.error(message);
  if (verbose && error instanceof Error && error.stack) out.note(error.stack);
  else if (!message.startsWith('Invalid AppCore'))
    out.note('  Run again with --verbose for details.');
  return ExitCode.ERROR;
}
