import type { ParsedOptions } from './argv';
import type { ExitCode } from './errors';
import type { Output } from './output';

export type OptionType = 'string' | 'boolean' | 'number' | 'list';

export interface OptionSpec {
  /** Long name without dashes, kebab-case: "dry-run" → --dry-run. */
  name: string;
  type: OptionType;
  description: string;
  /** Single-letter short form: "y" → -y. */
  alias?: string;
  /** Placeholder shown in help: --feature <name>. */
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

export interface CommandContext {
  args: Record<string, string | undefined>;
  options: ParsedOptions;
  out: Output;
  /** Absolute path of the frontend project (the directory with package.json). */
  root: string;
}

export interface CliCommand {
  /** `<group>:<action>`, e.g. "i18n:check". */
  name: string;
  summary: string;
  description?: string;
  args?: ArgSpec[];
  options?: OptionSpec[];
  examples?: string[];
  run(ctx: CommandContext): Promise<ExitCode | void> | ExitCode | void;
}

/** Options every command accepts (the same names as the backend CLI). */
export const GLOBAL_OPTIONS: OptionSpec[] = [
  { name: 'help', alias: 'h', type: 'boolean', description: 'Show help' },
  { name: 'json', type: 'boolean', description: 'Machine-readable output on stdout' },
  { name: 'verbose', alias: 'v', type: 'boolean', description: 'Show stack traces' },
  { name: 'no-color', type: 'boolean', description: 'Plain output (also: NO_COLOR=1)' },
  { name: 'version', type: 'boolean', description: 'Print the CLI version' },
];

export const groupOf = (command: Pick<CliCommand, 'name'>): string =>
  command.name.split(':')[0] ?? command.name;
