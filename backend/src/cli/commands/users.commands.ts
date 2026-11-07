import { NotFoundError } from '#core/domain/errors/app-error.js';
import type { FilterCondition } from '#core/domain/pagination.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import { CreateUserUseCase } from '#modules/users/application/create-user.use-case.js';
import { ListUsersUseCase } from '#modules/users/application/list-users.use-case.js';
import { UpdateUserUseCase } from '#modules/users/application/update-user.use-case.js';
import {
  EndUserSessionsUseCase,
  ResetUserPasswordUseCase,
  UnlockUserUseCase,
} from '#modules/users/application/user-admin.use-cases.js';
import type { User } from '#modules/users/domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type { ArgSpec, CliCommand, CommandContext, OptionSpec } from '../kernel/command.js';
import { ExitCode, UsageError } from '../kernel/errors.js';
import { generateTemporaryPassword } from '../support/passwords.js';

const USERNAME: ArgSpec = { name: 'username', description: 'Sign-in name of the user' };
const PASSWORD_STDIN: OptionSpec = {
  name: 'password-stdin',
  type: 'boolean',
  description: 'Read the password from standard input instead of generating one',
};

async function findUser(ctx: CommandContext, username: string): Promise<User> {
  const user = await ctx.get<UserRepository>(USER_REPOSITORY).findByUsername(username);
  if (!user) throw new NotFoundError('User', username);
  return user;
}

const summary = (user: User) => ({
  id: user.id,
  username: user.username,
  fullName: user.fullName,
  email: user.email,
  status: user.status,
  branchCode: user.branchCode,
  roles: [...user.roleCodes],
  mfaEnabled: user.mfaEnabled,
  lockedUntil: user.lockedUntil,
  lastLoginAt: user.lastLoginAt,
});

/**
 * Passwords never travel as arguments. Either the operator pipes one in, or a
 * random one is generated and shown exactly once.
 */
async function obtainPassword(
  ctx: CommandContext,
): Promise<{ password: string; generated: boolean }> {
  if (ctx.options.flag('password-stdin')) {
    return { password: await ctx.readSecret('Password'), generated: false };
  }
  return {
    password: generateTemporaryPassword(ctx.config.securityPolicy.password),
    generated: true,
  };
}

function warnIfSessionsAreLocal(ctx: CommandContext): void {
  if (ctx.get<KeyValueStore>(KEY_VALUE_STORE).driver === 'memory') {
    ctx.out.warn(
      'KV_STORE=memory: sessions live inside the server process, so this command cannot end them. ' +
        'Restart the server, or use Redis.',
    );
  }
}

function printPassword(ctx: CommandContext, password: string): void {
  const { out, config } = ctx;
  out.heading('Temporary password (shown once — it is not stored anywhere readable)');
  out.line(`  ${password}`);
  out.line();
  out.info(
    config.securityPolicy.password.changeOnFirstLogin
      ? '  Hand it over through a secure channel. The user must replace it at the next sign-in.'
      : '  Hand it over through a secure channel and ask the user to change it.',
  );
}

const usersList: CliCommand = {
  name: 'users:list',
  summary: 'List users',
  options: [
    { name: 'search', type: 'string', valueName: 'text', description: 'Username, name or e-mail' },
    {
      name: 'status',
      type: 'string',
      choices: ['ACTIVE', 'LOCKED', 'DISABLED', 'PENDING_ACTIVATION'],
      description: 'Only users with this status',
    },
    { name: 'branch', type: 'string', valueName: 'code', description: 'Only users of this branch' },
    { name: 'page', type: 'number', default: 1, description: 'Page number' },
    { name: 'page-size', type: 'number', default: 20, description: 'Rows per page (max 100)' },
  ],
  examples: ['users:list --status LOCKED', 'users:list --search bekele --json'],
  async run({ get, options, principal, out }) {
    const filters: FilterCondition[] = [];
    const status = options.string('status');
    const branch = options.string('branch');
    if (status) filters.push({ field: 'status', operator: 'eq', value: status });
    if (branch) filters.push({ field: 'branchCode', operator: 'eq', value: branch });
    const pageSize = options.number('page-size') ?? 20;
    const pageNumber = options.number('page') ?? 1;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new UsageError('--page-size must be between 1 and 100', 'users:list');
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new UsageError('--page must be 1 or more', 'users:list');
    }

    const page = await get<ListUsersUseCase>(ListUsersUseCase).execute({
      principal,
      request: {
        page: pageNumber,
        pageSize,
        sort: [{ field: 'username', direction: 'asc' }],
        search: options.string('search'),
        filters,
      },
    });
    const users = page.items.map(summary);
    out.emit({ users, page: page.page, pageSize: page.pageSize, total: page.totalItems }, () => {
      out.table(
        [
          { header: 'USERNAME', value: (u) => u.username },
          { header: 'NAME', value: (u) => u.fullName, maxWidth: 28 },
          { header: 'STATUS', value: (u) => u.status },
          { header: 'BRANCH', value: (u) => u.branchCode },
          { header: 'ROLES', value: (u) => u.roles, maxWidth: 32 },
          { header: 'MFA', value: (u) => u.mfaEnabled },
          { header: 'LAST SIGN-IN', value: (u) => u.lastLoginAt },
        ],
        users,
      );
      out.line();
      out.info(`Page ${page.page} of ${page.totalPages} · ${page.totalItems} user(s)`);
    });
    return ExitCode.OK;
  },
};

const usersShow: CliCommand = {
  name: 'users:show',
  summary: 'Account details: status, lock, roles, permissions, password age',
  args: [USERNAME],
  examples: ['users:show jdoe'],
  async run(ctx) {
    const user = await findUser(ctx, ctx.args.username!);
    const maxAgeDays = ctx.config.securityPolicy.password.maxAgeDays;
    const details = {
      ...summary(user),
      phoneNumber: user.phoneNumber,
      authentication: user.externalProvider ? `external (${user.externalProvider})` : 'password',
      mfaMethod: user.mfaMethod,
      failedLoginAttempts: user.failedLoginAttempts,
      passwordChangedAt: user.passwordChangedAt,
      passwordExpiresAt: user.passwordExpiresAt(maxAgeDays),
      passwordMustChange: user.passwordMustChange,
      permissions: user.permissions,
      createdAt: user.createdAt,
      createdBy: user.createdBy,
      deletedAt: user.deletedAt,
    };
    ctx.out.emit(details, () => {
      ctx.out.keyValues(Object.entries(details));
    });
    return ExitCode.OK;
  },
};

const usersCreate: CliCommand = {
  name: 'users:create',
  summary: 'Create a user (for example the first administrator of a new environment)',
  description: [
    'Runs the same use case as the application: password policy, unique username and',
    'e-mail, known roles. A random temporary password is generated and shown once;',
    'pipe your own with --password-stdin.',
    '',
    'First administrator of a new environment:',
    '  permissions:sync',
    '  users:create --username admin --email admin@example.com --full-name "Administrator" --role SUPER_ADMIN',
  ].join('\n'),
  mutates: true,
  audit: { action: 'CLI_USER_CREATE', category: 'SECURITY', resourceType: 'User' },
  options: [
    { name: 'username', type: 'string', required: true, description: 'Sign-in name' },
    { name: 'email', type: 'string', required: true, description: 'E-mail address' },
    {
      name: 'full-name',
      type: 'string',
      required: true,
      valueName: 'name',
      description: 'Full name',
    },
    { name: 'role', type: 'list', required: true, valueName: 'code', description: 'Role code(s)' },
    { name: 'branch', type: 'string', valueName: 'code', description: 'Branch code' },
    { name: 'phone', type: 'string', valueName: 'number', description: 'Phone number' },
    PASSWORD_STDIN,
  ],
  examples: [
    'users:create --username admin --email admin@nib.et --full-name "System Administrator" --role SUPER_ADMIN',
    'users:create --username jdoe --email jdoe@nib.et --full-name "John Doe" --role USER --branch ADD01 --json',
  ],
  async run(ctx) {
    const { options, principal, out } = ctx;
    const { password, generated } = await obtainPassword(ctx);
    const user = await ctx.get<CreateUserUseCase>(CreateUserUseCase).execute({
      principal,
      username: options.string('username')!,
      email: options.string('email')!,
      fullName: options.string('full-name')!,
      phoneNumber: options.string('phone') ?? null,
      branchCode: options.string('branch') ?? null,
      roles: options.list('role'),
      password,
    });
    ctx.auditTarget(user.id, { username: user.username, roles: [...user.roleCodes] });

    out.emit({ user: summary(user), ...(generated ? { temporaryPassword: password } : {}) }, () => {
      out.success(`User "${user.username}" created with role(s) ${user.roleCodes.join(', ')}.`);
      if (generated) printPassword(ctx, password);
    });
    return ExitCode.OK;
  },
};

const usersUnlock: CliCommand = {
  name: 'users:unlock',
  summary: 'Unlock an account locked by failed sign-ins or by an administrator',
  args: [USERNAME],
  mutates: true,
  audit: { action: 'CLI_USER_UNLOCK', category: 'SECURITY', resourceType: 'User' },
  examples: ['users:unlock jdoe --reason "INC-2291 identity verified by phone"'],
  async run(ctx) {
    const user = await findUser(ctx, ctx.args.username!);
    ctx.auditTarget(user.id, { username: user.username });
    const saved = await ctx
      .get<UnlockUserUseCase>(UnlockUserUseCase)
      .execute(ctx.principal, user.id);
    ctx.out.emit({ user: summary(saved) }, () => {
      ctx.out.success(`"${saved.username}" is unlocked and can sign in again.`);
    });
    return ExitCode.OK;
  },
};

const usersResetPassword: CliCommand = {
  name: 'users:reset-password',
  summary: 'Set a temporary password and sign the user out everywhere',
  description:
    'For a locked-out administrator or a lost password when nobody can reset it in the\n' +
    'application. The password is policy-checked, the old one goes to the reuse history\n' +
    'and every session of the user ends.',
  args: [USERNAME],
  options: [PASSWORD_STDIN],
  mutates: true,
  audit: { action: 'CLI_USER_PASSWORD_RESET', category: 'SECURITY', resourceType: 'User' },
  examples: [
    'users:reset-password admin --reason "INC-2301 administrator locked out"',
    'users:reset-password admin --password-stdin --yes < new-password.txt',
  ],
  async run(ctx) {
    const user = await findUser(ctx, ctx.args.username!);
    ctx.auditTarget(user.id, { username: user.username });
    const { password, generated } = await obtainPassword(ctx);
    const saved = await ctx
      .get<ResetUserPasswordUseCase>(ResetUserPasswordUseCase)
      .execute(ctx.principal, user.id, password);
    ctx.out.emit(
      { user: summary(saved), ...(generated ? { temporaryPassword: password } : {}) },
      () => {
        ctx.out.success(`Password of "${saved.username}" was reset; their sessions were ended.`);
        if (generated) printPassword(ctx, password);
      },
    );
    warnIfSessionsAreLocal(ctx);
    return ExitCode.OK;
  },
};

const usersSetStatus: CliCommand = {
  name: 'users:set-status',
  summary: 'Enable or disable an account (disabling ends its sessions)',
  args: [USERNAME, { name: 'status', description: 'ACTIVE or DISABLED' }],
  mutates: true,
  approvalAction: 'users.update',
  audit: { action: 'CLI_USER_STATUS_CHANGE', category: 'SECURITY', resourceType: 'User' },
  examples: ['users:set-status jdoe DISABLED --reason "INC-2310 compromised account"'],
  async run(ctx) {
    const status = ctx.args.status!.toUpperCase();
    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      throw new UsageError('<status> must be ACTIVE or DISABLED', 'users:set-status');
    }
    const user = await findUser(ctx, ctx.args.username!);
    ctx.auditTarget(user.id, { username: user.username, from: user.status, to: status });
    const saved = await ctx.get<UpdateUserUseCase>(UpdateUserUseCase).execute({
      principal: ctx.principal,
      id: user.id,
      version: user.version,
      status,
    });
    ctx.out.emit({ user: summary(saved) }, () => {
      ctx.out.success(`"${saved.username}" is now ${saved.status}.`);
    });
    if (status === 'DISABLED') warnIfSessionsAreLocal(ctx);
    return ExitCode.OK;
  },
};

const usersRoles: CliCommand = {
  name: 'users:roles',
  summary: 'Add or remove roles of a user',
  description:
    'For restoring access when no administrator is left who can do it in the\n' +
    'application. Role changes reach the user at their next sign-in or token refresh.',
  args: [USERNAME],
  options: [
    { name: 'add', type: 'list', valueName: 'code', description: 'Role(s) to add' },
    { name: 'remove', type: 'list', valueName: 'code', description: 'Role(s) to remove' },
  ],
  mutates: true,
  approvalAction: 'users.update',
  audit: { action: 'CLI_USER_ROLES_CHANGE', category: 'SECURITY', resourceType: 'User' },
  examples: ['users:roles jdoe --add ADMIN --remove USER --reason "CHG-1101"'],
  async run(ctx) {
    const add = ctx.options.list('add').map((r) => r.toUpperCase());
    const remove = ctx.options.list('remove').map((r) => r.toUpperCase());
    if (add.length === 0 && remove.length === 0) {
      throw new UsageError('Pass --add and/or --remove', 'users:roles');
    }
    const user = await findUser(ctx, ctx.args.username!);
    const roles = [...new Set([...user.roleCodes, ...add])].filter((r) => !remove.includes(r));
    if (roles.length === 0) {
      throw new UsageError('A user needs at least one role', 'users:roles');
    }
    ctx.auditTarget(user.id, { username: user.username, added: add, removed: remove });
    const saved = await ctx.get<UpdateUserUseCase>(UpdateUserUseCase).execute({
      principal: ctx.principal,
      id: user.id,
      version: user.version,
      roles,
    });
    ctx.out.emit({ user: summary(saved) }, () => {
      ctx.out.success(`"${saved.username}" now has role(s) ${saved.roleCodes.join(', ')}.`);
    });
    return ExitCode.OK;
  },
};

const usersRevokeSessions: CliCommand = {
  name: 'users:revoke-sessions',
  summary: 'Sign a user out of every device',
  args: [USERNAME],
  mutates: true,
  audit: { action: 'CLI_USER_SESSIONS_REVOKE', category: 'SECURITY', resourceType: 'User' },
  examples: ['users:revoke-sessions jdoe --reason "INC-2310 lost laptop"'],
  async run(ctx) {
    const user = await findUser(ctx, ctx.args.username!);
    ctx.auditTarget(user.id, { username: user.username });
    const result = await ctx
      .get<EndUserSessionsUseCase>(EndUserSessionsUseCase)
      .execute(ctx.principal, user.id);
    ctx.auditTarget(user.id, { terminated: result.terminated });
    ctx.out.emit({ username: user.username, ...result }, () => {
      ctx.out.success(`${result.terminated} session(s) of "${user.username}" ended.`);
    });
    warnIfSessionsAreLocal(ctx);
    return ExitCode.OK;
  },
};

export const usersCommands: CliCommand[] = [
  usersList,
  usersShow,
  usersCreate,
  usersUnlock,
  usersResetPassword,
  usersSetStatus,
  usersRoles,
  usersRevokeSessions,
];
