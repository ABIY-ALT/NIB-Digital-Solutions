import type { CliCommand } from '../kernel/command.js';
import { accessCommands } from './access.commands.js';
import { complianceCommands } from './compliance.commands.js';
import { configCommands } from './config.commands.js';
import { systemCommands } from './system.commands.js';
import { usersCommands } from './users.commands.js';

/**
 * Every command of the backend CLI. To add one: write a CliCommand (see any
 * *.commands.ts) and list it here — help, parsing, the production controls and
 * the audit record come from the kernel.
 */
export const COMMANDS: readonly CliCommand[] = [
  ...configCommands,
  ...systemCommands,
  ...accessCommands,
  ...usersCommands,
  ...complianceCommands,
];

/** Command-name prefix → heading in `help`, in display order. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {
  config: 'Configuration',
  health: 'Diagnostics',
  db: 'Diagnostics',
  routes: 'Diagnostics',
  permissions: 'Access control',
  roles: 'Access control',
  users: 'Users',
  audit: 'Audit trail',
  retention: 'Data retention',
  jobs: 'Background jobs',
};
