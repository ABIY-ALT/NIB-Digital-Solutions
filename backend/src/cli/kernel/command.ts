import type { INestApplicationContext } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import type { Principal } from '#core/application/security/principal.js';
import type { AuditCategory } from '#core/domain/audit-record.js';
import type { ParsedOptions } from './argv.js';
import type { ExitCode } from './errors.js';
import type { Operator } from './operator.js';
import type { Output } from './output.js';

export type OptionType = 'string' | 'boolean' | 'number' | 'list';

export interface OptionSpec {
  /** Long name without dashes, kebab-case: "dry-run" → --dry-run. */
  name: string;
  type: OptionType;
  description: string;
  /** Single-letter short form: "y" → -y. */
  alias?: string;
  /** Placeholder shown in help: --role <code>. */
  valueName?: string;
  default?: string | number | boolean;
  required?: boolean;
  choices?: readonly string[];
}

export interface ArgSpec {
  name: string;
  description: string;
  required?: boolean;
}

/**
 * How much of the application a command needs:
 *   none     nothing (parses files, prints help) — starts instantly
 *   preview  the module graph without instantiating providers — no database
 *   full     the real application context: database, key/value store, use cases
 */
export type BootMode = 'none' | 'preview' | 'full';

export interface CommandAudit {
  /** Stable action name, e.g. "CLI_USER_CREATE". */
  action: string;
  category: AuditCategory;
  resourceType?: string;
}

export interface CommandContext {
  args: Record<string, string | undefined>;
  options: ParsedOptions;
  out: Output;
  /** Who is running the command (OS account or --operator). */
  operator: Operator;
  /** The operator as an application principal: full authority, attributed in every audit record. */
  principal: Principal;
  /** `{ id, username }` form of the operator, as application services expect it. */
  actor: { id: string; username: string };
  /** The application context. Throws for `boot: 'none'` commands. */
  app: INestApplicationContext;
  /** Validated configuration. Throws for `boot: 'none'` commands. */
  config: AppConfig;
  /** Resolves a provider from any module (`strict: false`). */
  get<T>(token: unknown): T;
  /** Adds the affected resource and non-sensitive details to the command's audit record. */
  auditTarget(resourceId: string | null, metadata?: Record<string, unknown>): void;
  /** Asks for confirmation (honours --yes; refuses when not interactive). */
  confirm(question: string): Promise<void>;
  /** Reads a secret: piped standard input, or a hidden prompt on a terminal. */
  readSecret(prompt: string): Promise<string>;
}

export interface CliCommand {
  /** `<group>:<action>`, e.g. "users:create". The group is the part before the colon. */
  name: string;
  /** One line for the command list. */
  summary: string;
  /** Longer explanation for `help <command>`. */
  description?: string;
  args?: ArgSpec[];
  options?: OptionSpec[];
  examples?: string[];
  /** Default: full. */
  boot?: BootMode;
  /** Changes data: in production it needs --reason and a confirmation. */
  mutates?: boolean | ((options: ParsedOptions) => boolean);
  /** Removes data or cannot be undone: always asks for confirmation. */
  destructive?: boolean | ((options: ParsedOptions) => boolean);
  /**
   * Maker–checker action this command performs directly. When that action is
   * under four-eyes control (APPROVAL_ACTIONS) the command is refused unless
   * the operator passes --break-glass.
   */
  approvalAction?: string;
  /** Recorded in the tamper-evident audit trail (success and failure). */
  audit?: CommandAudit;
  run(ctx: CommandContext): Promise<ExitCode | void> | ExitCode | void;
}

/** Options every command accepts. */
export const GLOBAL_OPTIONS: OptionSpec[] = [
  { name: 'help', alias: 'h', type: 'boolean', description: 'Show help' },
  { name: 'json', type: 'boolean', description: 'Machine-readable output on stdout' },
  {
    name: 'yes',
    alias: 'y',
    type: 'boolean',
    description: 'Answer yes to confirmations (required when not on a terminal)',
  },
  {
    name: 'reason',
    type: 'string',
    valueName: 'text',
    description: 'Why the change is made, e.g. a ticket number (required in production)',
  },
  {
    name: 'operator',
    type: 'string',
    valueName: 'name',
    description: 'Person running the command (default: APPCORE_OPERATOR or the OS account)',
  },
  {
    name: 'break-glass',
    type: 'boolean',
    description: 'Apply a change that is under maker–checker control (audited as break-glass)',
  },
  { name: 'verbose', alias: 'v', type: 'boolean', description: 'Show application logs and stacks' },
  { name: 'no-color', type: 'boolean', description: 'Plain output (also: NO_COLOR=1)' },
  { name: 'version', type: 'boolean', description: 'Print the CLI version' },
];

export const groupOf = (command: Pick<CliCommand, 'name'>): string =>
  command.name.split(':')[0] ?? command.name;
