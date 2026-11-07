import type { CliCommand } from '../kernel/command';
import { checkCommands } from './check.commands';
import { doctor } from './doctor.command';
import { makeCommands } from './make.commands';

/**
 * Every command of the frontend CLI. To add one: write a CliCommand and list
 * it here — help, option parsing and exit codes come from the kernel.
 */
export const COMMANDS: readonly CliCommand[] = [doctor, ...checkCommands, ...makeCommands];

/** Command-name prefix → heading in `help`, in display order. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {
  doctor: 'Checks',
  env: 'Checks',
  config: 'Checks',
  i18n: 'Checks',
  routes: 'Checks',
  make: 'Scaffolding',
};
