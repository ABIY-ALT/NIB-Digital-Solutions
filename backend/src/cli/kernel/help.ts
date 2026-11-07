import { valueHint } from './argv.js';
import { GLOBAL_OPTIONS, groupOf, type CliCommand, type OptionSpec } from './command.js';
import type { Output } from './output.js';

export interface HelpInfo {
  title: string;
  version: string;
  /** How the CLI is invoked, e.g. "npm run cli --". */
  invocation: string;
  /** Group prefix → heading, in display order. */
  groups: Readonly<Record<string, string>>;
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
      option.type === 'list' ? 'repeatable or comma-separated' : '',
    ].filter(Boolean);
    out.line(
      `  ${optionLabel(option).padEnd(width)}  ${option.description}${
        notes.length ? out.paint(` (${notes.join('; ')})`, 'dim') : ''
      }`,
    );
  }
}

export function printGlobalHelp(
  out: Output,
  commands: readonly CliCommand[],
  info: HelpInfo,
): void {
  const version = out.paint(`v${info.version}`, 'dim');
  out.line(`${out.paint(info.title, 'bold')} ${version}`);
  out.line(`\nUsage: ${info.invocation} <command> [arguments] [options]`);

  const width = Math.max(...commands.map((c) => c.name.length));
  const prefixes = [...new Set([...Object.keys(info.groups), ...commands.map(groupOf)])];
  const printed = new Set<string>();
  for (const prefix of prefixes) {
    const heading = info.groups[prefix] ?? prefix;
    const members = commands.filter((c) => (info.groups[groupOf(c)] ?? groupOf(c)) === heading);
    if (members.length === 0 || printed.has(heading)) continue;
    printed.add(heading);
    out.heading(heading);
    for (const command of members) {
      out.line(`  ${out.paint(command.name.padEnd(width), 'cyan')}  ${command.summary}`);
    }
  }

  out.heading('Global options');
  optionLines(out, GLOBAL_OPTIONS);
  out.heading('Exit codes');
  out.line('  0 success · 1 error · 2 a check found a problem · 3 refused by a safety control');
  out.line('  64 wrong usage');
  out.line(`\nDetails for one command: ${info.invocation} help <command>`);
}

export function printCommandHelp(out: Output, command: CliCommand, info: HelpInfo): void {
  const synopsis = [
    command.name,
    ...(command.args ?? []).map((a) => (a.required === false ? `[${a.name}]` : `<${a.name}>`)),
  ].join(' ');
  out.line(`${out.paint(command.name, 'bold')} — ${command.summary}`);
  out.line(`\nUsage: ${info.invocation} ${synopsis} [options]`);
  if (command.description) out.line(`\n${command.description}`);

  if (command.args?.length) {
    out.heading('Arguments');
    const width = Math.max(...command.args.map((a) => a.name.length));
    for (const arg of command.args) {
      out.line(`  ${arg.name.padEnd(width)}  ${arg.description}`);
    }
  }
  if (command.options?.length) {
    out.heading('Options');
    optionLines(out, command.options);
  }
  out.heading('Global options');
  optionLines(out, GLOBAL_OPTIONS);

  const controls = controlNotes(command);
  if (controls.length) {
    out.heading('Controls');
    for (const control of controls) out.line(`  ${control}`);
  }
  if (command.examples?.length) {
    out.heading('Examples');
    for (const example of command.examples) out.line(`  ${info.invocation} ${example}`);
  }
}

/** The safety controls that apply to a command, in plain words. */
function controlNotes(command: CliCommand): string[] {
  return [
    command.mutates ? 'Changes data: in production it needs --reason and a confirmation.' : '',
    command.destructive ? 'Removes data: asks for confirmation (or --yes).' : '',
    command.approvalAction
      ? `Refused while "${command.approvalAction}" is under maker–checker control, unless --break-glass.`
      : '',
    command.audit ? `Audited as ${command.audit.action}.` : '',
  ].filter(Boolean);
}
