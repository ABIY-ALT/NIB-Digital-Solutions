import type { ArgSpec, OptionSpec } from './command.js';
import { UsageError } from './errors.js';

type OptionValue = string | number | boolean | string[];

/** Typed access to parsed options. Asking for an undeclared option is a programming error. */
export class ParsedOptions {
  constructor(
    private readonly values: ReadonlyMap<string, OptionValue>,
    private readonly specs: ReadonlyMap<string, OptionSpec>,
  ) {}

  has(name: string): boolean {
    return this.values.has(name);
  }

  flag(name: string): boolean {
    return this.read(name, 'boolean') === true;
  }

  string(name: string): string | undefined {
    return this.read(name, 'string') as string | undefined;
  }

  number(name: string): number | undefined {
    return this.read(name, 'number') as number | undefined;
  }

  list(name: string): string[] {
    return (this.read(name, 'list') as string[] | undefined) ?? [];
  }

  /** Names of the options the caller actually passed (for audit records — never the values). */
  provided(): string[] {
    return [...this.values.keys()].sort((a, b) => a.localeCompare(b));
  }

  private read(name: string, type: OptionSpec['type']): OptionValue | undefined {
    const spec = this.specs.get(name);
    if (!spec) throw new Error(`Option --${name} is not declared by this command`);
    if (spec.type !== type) throw new Error(`Option --${name} is a ${spec.type}, not a ${type}`);
    return this.values.get(name) ?? spec.default;
  }
}

export interface ParsedCommandLine {
  args: Record<string, string | undefined>;
  options: ParsedOptions;
}

/**
 * The first positional token is the command name. Global options may come
 * before it (`--json users:list`), so value-taking options skip their value.
 */
export function findCommandName(
  argv: readonly string[],
  globals: readonly OptionSpec[],
): { name: string | undefined; rest: string[] } {
  const takesValue = new Set<string>();
  for (const spec of globals) {
    if (spec.type === 'boolean') continue;
    takesValue.add(`--${spec.name}`);
    if (spec.alias) takesValue.add(`-${spec.alias}`);
  }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === '--') break;
    if (token.startsWith('-')) {
      if (takesValue.has(token)) i++;
      continue;
    }
    return { name: token, rest: [...argv.slice(0, i), ...argv.slice(i + 1)] };
  }
  return { name: undefined, rest: [...argv] };
}

/**
 * Parses `--name value`, `--name=value`, `--flag`, `--no-flag`, `-x`, repeated
 * and comma-separated lists, and `--` (everything after it is positional).
 * Unknown options and wrong argument counts are usage errors, never ignored.
 */
export function parseCommandLine(
  argv: readonly string[],
  spec: { command?: string; args?: readonly ArgSpec[]; options: readonly OptionSpec[] },
): ParsedCommandLine {
  const fail: Fail = (message) => {
    throw new UsageError(message, spec.command);
  };
  const known = indexOptions(spec.options);
  const { values, positionals } = scanTokens(argv, known, fail);
  const args = bindArguments(positionals, spec.args ?? [], fail);
  for (const option of spec.options) {
    if (option.required && !values.has(option.name)) {
      fail(`Missing required option --${option.name}${valueHint(option)}`);
    }
  }
  return { args, options: new ParsedOptions(values, known.byName) };
}

/** ` <value>` after an option that takes one, for usage messages and help. */
export const valueHint = (option: OptionSpec): string =>
  option.type === 'boolean' ? '' : ` <${option.valueName ?? option.type}>`;

type Fail = (message: string) => never;

interface OptionIndex {
  byName: ReadonlyMap<string, OptionSpec>;
  byAlias: ReadonlyMap<string, OptionSpec>;
}

interface OptionToken {
  option: OptionSpec;
  /** The value given as `--name=value`. */
  inline: string | undefined;
  /** `--no-flag`. */
  negated: boolean;
}

function indexOptions(options: readonly OptionSpec[]): OptionIndex {
  const byName = new Map<string, OptionSpec>();
  const byAlias = new Map<string, OptionSpec>();
  for (const option of options) {
    byName.set(option.name, option);
    if (option.alias) byAlias.set(option.alias, option);
  }
  return { byName, byAlias };
}

/** Splits the tokens into option values and positionals. */
function scanTokens(
  argv: readonly string[],
  known: OptionIndex,
  fail: Fail,
): { values: Map<string, OptionValue>; positionals: string[] } {
  const values = new Map<string, OptionValue>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }
    const { option, inline, negated } = readOptionToken(token, known, fail);
    if (option.type === 'boolean') {
      values.set(option.name, flagValue(option, inline, negated, fail));
    } else if (inline === undefined) {
      assign(values, option, requireValue(option, argv[++i], fail), fail);
    } else {
      assign(values, option, inline, fail);
    }
  }
  return { values, positionals };
}

function readOptionToken(token: string, known: OptionIndex, fail: Fail): OptionToken {
  if (!token.startsWith('--')) {
    if (token.length !== 2) fail(`Unknown option ${token} (short options are one letter)`);
    const option = known.byAlias.get(token.slice(1));
    if (!option) fail(`Unknown option ${token}`);
    return { option, inline: undefined, negated: false };
  }
  const eq = token.indexOf('=');
  const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
  const inline = eq === -1 ? undefined : token.slice(eq + 1);
  const option = known.byName.get(name);
  if (option) return { option, inline, negated: false };
  const positive = name.startsWith('no-') ? known.byName.get(name.slice(3)) : undefined;
  if (positive?.type === 'boolean') return { option: positive, inline, negated: true };
  const hint = closest(name, [...known.byName.keys()]);
  const suggestion = hint ? ` (did you mean --${hint}?)` : '';
  return fail(`Unknown option --${name}${suggestion}`);
}

function flagValue(
  option: OptionSpec,
  inline: string | undefined,
  negated: boolean,
  fail: Fail,
): boolean {
  if (inline !== undefined && !['true', 'false'].includes(inline)) {
    fail(`--${option.name} takes no value`);
  }
  return negated ? false : inline !== 'false';
}

/** The value of `--name value`: the next token, unless there is none or it is another option. */
function requireValue(option: OptionSpec, next: string | undefined, fail: Fail): string {
  if (next === undefined || (next.startsWith('--') && next !== '--')) {
    fail(`--${option.name} needs a value${valueHint(option)}`);
  }
  return next;
}

function assign(
  values: Map<string, OptionValue>,
  option: OptionSpec,
  raw: string,
  fail: Fail,
): void {
  if (option.choices && option.type !== 'list' && !option.choices.includes(raw)) {
    fail(`--${option.name} must be one of: ${option.choices.join(', ')} (got "${raw}")`);
  }
  if (option.type === 'number') {
    values.set(option.name, toNumber(option, raw, fail));
  } else if (option.type === 'list') {
    const current = values.get(option.name);
    const items = toListItems(option, raw, fail);
    values.set(option.name, [...(Array.isArray(current) ? current : []), ...items]);
  } else {
    values.set(option.name, raw);
  }
}

function toNumber(option: OptionSpec, raw: string, fail: Fail): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) {
    fail(`--${option.name} expects a number (got "${raw}")`);
  }
  return n;
}

function toListItems(option: OptionSpec, raw: string, fail: Fail): string[] {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const { choices } = option;
  if (!choices) return items;
  const invalid = items.filter((item) => !choices.includes(item));
  if (invalid.length) {
    fail(`--${option.name} accepts: ${choices.join(', ')} (got "${invalid.join(', ')}")`);
  }
  return items;
}

/** Positionals → declared arguments; too many or a missing required one is a usage error. */
function bindArguments(
  positionals: readonly string[],
  declared: readonly ArgSpec[],
  fail: Fail,
): Record<string, string | undefined> {
  if (positionals.length > declared.length) {
    fail(
      declared.length === 0
        ? `Unexpected argument "${positionals[0]}"`
        : `Too many arguments: "${positionals.slice(declared.length).join(' ')}"`,
    );
  }
  const args: Record<string, string | undefined> = {};
  declared.forEach((arg, index) => {
    const value = positionals[index];
    if (value === undefined && arg.required !== false) fail(`Missing argument <${arg.name}>`);
    args[arg.name] = value;
  });
  return args;
}

/** Nearest known name within two edits, for "did you mean" hints. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}
