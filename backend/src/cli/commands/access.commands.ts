import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import {
  PERMISSION_CATALOGUE,
  SYSTEM_ROLES,
} from '#modules/authorization/domain/permission-catalogue.js';
import { ListRolesUseCase } from '#modules/roles/application/role.use-cases.js';
import type { CliCommand } from '../kernel/command.js';
import { ExitCode } from '../kernel/errors.js';
import {
  applyCatalogueSync,
  isEmptyPlan,
  planCatalogueSync,
  readCatalogueState,
  type CatalogueSyncPlan,
} from '../support/catalogue-sync.js';

/** What happens (or would happen) to a permission that left the catalogue. */
function orphanOutcome(
  permission: CatalogueSyncPlan['orphanPermissions'][number],
  verb: string,
): string {
  if (permission.pruned) return `${verb} retired`;
  if (permission.roleCount > 0) {
    return `still granted by ${permission.roleCount} role(s) — remove it from them first`;
  }
  return 'unused (--prune to retire)';
}

const permissionsList: CliCommand = {
  name: 'permissions:list',
  summary: 'The permission catalogue in code, compared with the database',
  examples: ['permissions:list', 'permissions:list --json'],
  async run({ get, out }) {
    const state = await readCatalogueState(get<PrismaService>(PrismaService));
    const stored = new Map(state.permissions.filter((p) => !p.deleted).map((p) => [p.code, p]));
    const rows = [
      ...Object.entries(PERMISSION_CATALOGUE).map(([code, description]) => ({
        code,
        description,
        roles: stored.get(code)?.roleCount ?? 0,
        status: stored.has(code) ? 'in sync' : 'missing in database',
      })),
      ...[...stored.values()]
        .filter((p) => !(p.code in PERMISSION_CATALOGUE))
        .map((p) => ({
          code: p.code,
          description: p.description ?? '',
          roles: p.roleCount,
          status: 'not in catalogue',
        })),
    ];
    const drift = rows.filter((r) => r.status !== 'in sync').length;
    out.emit({ permissions: rows, inSync: drift === 0 }, () => {
      out.table(
        [
          { header: 'CODE', value: (r) => r.code },
          { header: 'DESCRIPTION', value: (r) => r.description, maxWidth: 56 },
          { header: 'ROLES', value: (r) => r.roles, align: 'right' },
          { header: 'STATUS', value: (r) => r.status },
        ],
        rows,
      );
      out.line();
      if (drift)
        out.warn(`${drift} permission(s) differ from the catalogue. Run: permissions:sync`);
      else out.success(`${rows.length} permissions, database in sync with the catalogue.`);
    });
    return ExitCode.OK;
  },
};

const permissionsSync: CliCommand = {
  name: 'permissions:sync',
  summary: 'Load the permission catalogue and standard roles into the database',
  description: [
    'The production-safe counterpart of the development seed: it creates what is',
    'missing and nothing else — no demo users, no sample data. Run it after every',
    'deployment that adds permissions (for example a generated feature).',
    '',
    'Existing roles are never changed: an administrator may have adjusted them.',
    'Differences from the defaults are reported; --reset-roles restores the defaults.',
    'Permissions removed from the code are reported; --prune retires the unused ones.',
    '',
    'Permissions are read when a user signs in or a session refreshes, so a change',
    'reaches signed-in users at their next token refresh.',
  ].join('\n'),
  mutates: (options) => !options.flag('dry-run'),
  destructive: (options) =>
    !options.flag('dry-run') && (options.flag('prune') || options.flag('reset-roles')),
  audit: { action: 'CLI_PERMISSIONS_SYNC', category: 'SECURITY', resourceType: 'Permission' },
  options: [
    { name: 'dry-run', type: 'boolean', description: 'Show what would change, change nothing' },
    {
      name: 'prune',
      type: 'boolean',
      description: 'Retire permissions that left the catalogue and that no role uses',
    },
    {
      name: 'reset-roles',
      type: 'boolean',
      description: 'Put the standard roles back to their default permissions',
    },
  ],
  examples: [
    'permissions:sync --dry-run',
    'permissions:sync --reason "CHG-1042 release 1.4" --yes',
    'permissions:sync --prune',
  ],
  async run({ get, options, out, operator, auditTarget }) {
    const prisma = get<PrismaService>(PrismaService);
    const dryRun = options.flag('dry-run');
    const plan = planCatalogueSync(
      PERMISSION_CATALOGUE,
      SYSTEM_ROLES,
      await readCatalogueState(prisma),
      { prune: options.flag('prune'), resetRoles: options.flag('reset-roles') },
    );
    const changed = !isEmptyPlan(plan);
    if (changed && !dryRun) await applyCatalogueSync(prisma, plan, SYSTEM_ROLES, operator.id);

    auditTarget(null, {
      dryRun,
      permissionsCreated: plan.createPermissions.map((p) => p.code),
      permissionsUpdated: plan.updatePermissions.map((p) => p.code),
      permissionsRetired: plan.orphanPermissions.filter((p) => p.pruned).map((p) => p.code),
      rolesCreated: plan.createRoles.map((r) => r.code),
      rolesReset: plan.driftedRoles.filter((r) => r.reset).map((r) => r.code),
    });

    out.emit({ dryRun, changed, plan }, () => {
      const verb = dryRun ? 'would be' : 'was';
      const section = (title: string, lines: string[]): void => {
        if (lines.length === 0) return;
        out.heading(title);
        for (const line of lines) out.line(`  ${line}`);
      };
      section(
        `Permissions ${dryRun ? 'to create' : 'created'}`,
        plan.createPermissions.map((p) => `+ ${p.code}  ${out.paint(p.description, 'dim')}`),
      );
      section(
        `Descriptions ${dryRun ? 'to update' : 'updated'}`,
        plan.updatePermissions.map((p) => `~ ${p.code}`),
      );
      section(
        `Standard roles ${dryRun ? 'to create' : 'created'}`,
        plan.createRoles.map((r) => `+ ${r.code}  ${out.paint(r.permissions.join(', '), 'dim')}`),
      );
      section(
        'Standard roles that differ from the defaults',
        plan.driftedRoles.map(
          (r) =>
            `${r.code}: ` +
            [
              r.missing.length ? `lacks ${r.missing.join(', ')}` : '',
              r.extra.length ? `also grants ${r.extra.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('; ') +
            (r.reset ? ` — ${verb} reset` : ' — left as is (--reset-roles to restore)'),
        ),
      );
      section(
        'Permissions no longer in the catalogue',
        plan.orphanPermissions.map((p) => `${p.code}: ${orphanOutcome(p, verb)}`),
      );
      out.line();
      if (!changed) out.success('Nothing to do: the database matches the catalogue.');
      else if (dryRun) out.info('Dry run: nothing was changed.');
      else out.success('The catalogue was synchronised.');
    });
    return ExitCode.OK;
  },
};

const rolesList: CliCommand = {
  name: 'roles:list',
  summary: 'Roles with their permissions and number of users',
  options: [
    { name: 'search', type: 'string', valueName: 'text', description: 'Code, name or description' },
  ],
  examples: ['roles:list', 'roles:list --search admin --json'],
  async run({ get, options, out }) {
    const page = await get<ListRolesUseCase>(ListRolesUseCase).execute({
      page: 1,
      pageSize: 100,
      sort: [{ field: 'code', direction: 'asc' }],
      search: options.string('search'),
      filters: [],
    });
    const roles = page.items.map((role) => ({
      code: role.code,
      name: role.name,
      system: role.isSystem,
      users: role.userCount,
      permissions: [...role.permissionCodes],
    }));
    out.emit({ roles, total: page.totalItems }, () => {
      out.table(
        [
          { header: 'CODE', value: (r) => r.code },
          { header: 'NAME', value: (r) => r.name },
          { header: 'SYSTEM', value: (r) => r.system },
          { header: 'USERS', value: (r) => r.users, align: 'right' },
          { header: 'PERMISSIONS', value: (r) => r.permissions, maxWidth: 70 },
        ],
        roles,
      );
    });
    return ExitCode.OK;
  },
};

export const accessCommands: CliCommand[] = [permissionsList, permissionsSync, rolesList];
