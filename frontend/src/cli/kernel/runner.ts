import { closest, findCommandName, parseCommandLine, valueHint } from './argv';
import { GLOBAL_OPTIONS, groupOf, type CliCommand, type OptionSpec } from './command';
import { ExitCode, RefusedError, UsageError } from './errors';
import { Output, type OutputStreams } from './output';

export interface CliRuntime {
  commands: readonly CliCommand[];
  title: string;
  version: string;
  /** How the CLI is invoked, e.g. "npm run cli --". */
  invocation: string;
  /** Command-name prefix → heading in `help`, in display order. */
  groups: Readonly<Record<string, string>>;
  root: string;
  streams: OutputStreams;
  env: NodeJS.ProcessEnv;
  colorSupported: boolean;
}

/** Runs one command line and returns the exit code. Never throws. */
export async function runCli(argv: readonly string[], runtime: CliRuntime): Promise<ExitCode> {
  const json = argv.includes('--json');
  const color =
    runtime.colorSupported && !argv.includes('--no-color') && !runtime.env.NO_COLOR && !json;
  const out = new Output(runtime.streams, { json, color });
  const verbose = argv.includes('--verbose') || argv.includes('-v');

  try {
    return await dispatch(argv, runtime, out);
  } catch (error) {
    return report(error, out, runtime, verbose);
  }
}

async function dispatch(
  argv: readonly string[],
  runtime: CliRuntime,
  out: Output,
): Promise<ExitCode> {
  const { name, rest } = findCommandName(argv, GLOBAL_OPTIONS);
  if (!name) {
    if (argv.includes('--version')) {
      out.emit({ version: runtime.version }, () => out.line(runtime.version));
    } else printGlobalHelp(out, runtime);
    return ExitCode.OK;
  }
  if (name === 'help') {
    const topic = findCommandName(rest, GLOBAL_OPTIONS).name;
    if (topic) printCommandHelp(out, lookup(runtime.commands, topic), runtime);
    else printGlobalHelp(out, runtime);
    return ExitCode.OK;
  }
  const command = lookup(runtime.commands, name);
  if (rest.includes('--help') || rest.includes('-h')) {
    printCommandHelp(out, command, runtime);
    return ExitCode.OK;
  }
  const { args, options } = parseCommandLine(rest, {
    command: command.name,
    args: command.args,
    options: [...GLOBAL_OPTIONS, ...(command.options ?? [])],
  });
  return (await command.run({ args, options, out, root: runtime.root })) ?? ExitCode.OK;
}

function report(error: unknown, out: Output, runtime: CliRuntime, verbose: boolean): ExitCode {
  if (error instanceof UsageError) {
    out.error(error.message);
    const helpCommand = error.command ? `help ${error.command}` : 'help';
    out.note(`  Help: ${runtime.invocation} ${helpCommand}`);
    return ExitCode.USAGE;
  }
  if (error instanceof RefusedError) {
    out.error(error.message);
    return ExitCode.REFUSED;
  }
  out.error(error instanceof Error ? error.message : String(error));
  if (verbose && error instanceof Error && error.stack) out.note(error.stack);
  return ExitCode.ERROR;
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

const optionLabel = (option: OptionSpec): string => {
  const long = `--${option.name}${valueHint(option)}`;
  return option.alias ? `-${option.alias}, ${long}` : `    ${long}`;
};

function optionLines(out: Output, options: readonly OptionSpec[]): void {
  const width = Math.max(...options.map((o) => optionLabel(o).length));
  for (const option of options) {
    const notes = [
      option.choices ? `one of: ${option.choices.join(', ')}` : '',
      option.default !== undefined ? `default: ${String(option.default)}` : '',
      option.required ? 'required' : '',
    ].filter(Boolean);
    out.line(
      `  ${optionLabel(option).padEnd(width)}  ${option.description}${
        notes.length ? out.paint(` (${notes.join('; ')})`, 'dim') : ''
      }`,
    );
  }
}

function printGlobalHelp(out: Output, runtime: CliRuntime): void {
  const { commands, groups } = runtime;
  const version = out.paint(`v${runtime.version}`, 'dim');
  out.line(`${out.paint(runtime.title, 'bold')} ${version}`);
  out.line(`\nUsage: ${runtime.invocation} <command> [arguments] [options]`);
  const width = Math.max(...commands.map((c) => c.name.length));
  const headings = [
    ...new Set([
      ...Object.values(groups),
      ...commands.map((c) => groups[groupOf(c)] ?? groupOf(c)),
    ]),
  ];
  for (const heading of headings) {
    const members = commands.filter((c) => (groups[groupOf(c)] ?? groupOf(c)) === heading);
    if (members.length === 0) continue;
    out.heading(heading);
    for (const command of members) {
      out.line(`  ${out.paint(command.name.padEnd(width), 'cyan')}  ${command.summary}`);
    }
  }
  out.heading('Global options');
  optionLines(out, GLOBAL_OPTIONS);
  out.heading('Exit codes');
  out.line('  0 success · 1 error · 2 a check found a problem · 3 refused · 64 wrong usage');
  out.line(`\nDetails for one command: ${runtime.invocation} help <command>`);
}

function printCommandHelp(out: Output, command: CliCommand, runtime: CliRuntime): void {
  const synopsis = [
    command.name,
    ...(command.args ?? []).map((a) => (a.required === false ? `[${a.name}]` : `<${a.name}>`)),
  ].join(' ');
  out.line(`${out.paint(command.name, 'bold')} — ${command.summary}`);
  out.line(`\nUsage: ${runtime.invocation} ${synopsis} [options]`);
  if (command.description) out.line(`\n${command.description}`);
  if (command.args?.length) {
    out.heading('Arguments');
    const width = Math.max(...command.args.map((a) => a.name.length));
    for (const arg of command.args) out.line(`  ${arg.name.padEnd(width)}  ${arg.description}`);
  }
  if (command.options?.length) {
    out.heading('Options');
    optionLines(out, command.options);
  }
  out.heading('Global options');
  optionLines(out, GLOBAL_OPTIONS);
  if (command.examples?.length) {
    out.heading('Examples');
    for (const example of command.examples) out.line(`  ${runtime.invocation} ${example}`);
  }
}
