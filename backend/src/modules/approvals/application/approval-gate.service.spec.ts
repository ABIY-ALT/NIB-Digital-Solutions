import type { ApprovalHandler } from '#core/application/ports/approval.port.js';
import type { EventBus } from '#core/application/ports/event-bus.port.js';
import type { RequestContextAccessor } from '#core/application/ports/request-context.port.js';
import type {
  SettingDefinition,
  Settings,
  SettingValue,
} from '#core/application/ports/settings.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UserRepository } from '#modules/users/domain/user.repository.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import { APPROVAL_EXPIRY_SETTING, ApprovalGateService } from './approval-gate.service.js';
import type { ApprovalRepository } from './approval.repository.js';

const HOUR = 3_600_000;
const maker = {
  userId: 'u1',
  username: 'maker',
  sessionId: 's1',
  roles: ['ADMIN'],
  permissions: ['roles:update'],
  attributes: {},
  mfaVerified: false,
  authMethod: 'password',
} satisfies Principal;

function setup(stored: Record<string, SettingValue> = {}) {
  const defined: SettingDefinition[] = [];
  const settings = {
    define: (d: readonly SettingDefinition[]) => void defined.push(...d),
    number: (key: string) => {
      const definition = defined.find((d) => d.key === key)!;
      return Promise.resolve(Number(key in stored ? stored[key] : definition.default));
    },
  } as unknown as Settings;
  const created: ApprovalRequest[] = [];
  const repo = {
    create: (r: ApprovalRequest) => (created.push(r), Promise.resolve()),
    findPendingFor: () => Promise.resolve(null),
  } as unknown as ApprovalRepository;
  const users = {
    findContacts: () => Promise.resolve([]),
    findActiveUserIds: () => Promise.resolve(['checker']),
  } as unknown as UserRepository;
  const gate = new ApprovalGateService(
    repo,
    users,
    { publish: () => Promise.resolve() } as unknown as EventBus,
    { current: () => undefined } as unknown as RequestContextAccessor,
    { enabled: true, actions: ['roles.update'], expiryHours: 72 },
    settings,
  );
  gate.onModuleInit();
  const handler: ApprovalHandler<{ id: string }> = {
    action: 'roles.update',
    resourceType: 'Role',
    checkerPermissions: ['roles:update'],
    describe: (p) =>
      Promise.resolve({ resourceId: p.id, summary: 'Update role', before: {}, after: {} }),
    execute: () => Promise.resolve({}),
  };
  gate.register(handler);
  const submit = async () => {
    const before = Date.now();
    await gate.submit({
      action: 'roles.update',
      principal: maker,
      payload: { id: 'r1' },
      comment: null,
      execute: () => Promise.resolve(null),
    });
    return (created[0]!.expiresAt.getTime() - before) / HOUR;
  };
  return { defined, submit };
}

describe('ApprovalGateService request expiry', () => {
  it('adds the expiry to Settings with the server value (APPROVAL_EXPIRY_HOURS) as default', () => {
    const { defined } = setup();
    expect(defined).toEqual([
      expect.objectContaining({
        key: APPROVAL_EXPIRY_SETTING,
        group: 'approvals',
        type: 'number',
        default: 72,
        min: 1,
      }),
    ]);
  });

  it('uses the server value until an administrator changes the setting', async () => {
    expect(await setup().submit()).toBeCloseTo(72, 1);
  });

  it('gives new requests the expiry set in Settings', async () => {
    expect(await setup({ [APPROVAL_EXPIRY_SETTING]: 8 }).submit()).toBeCloseTo(8, 1);
  });
});
