/**
 * Development / test seed. Idempotent: safe to run repeatedly.
 *
 *   npm run db:seed
 *
 * Creates the permission catalogue, standard roles and demo users.
 * NEVER run against production.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient, type Prisma, type UserStatus } from '../src/generated/prisma/client.js';
import { FieldEncryption } from '../src/core/infrastructure/crypto/field-encryption.js';
import {
  PERMISSION_CATALOGUE,
  SYSTEM_ROLES,
} from '../src/modules/authorization/domain/permission-catalogue.js';
import { seedMarketplace } from './seed-marketplace.js';
import { REFERENCE_DATA } from './seed-reference-data.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const SEED_ACTOR = 'system:seed';

// The catalogue lives in src/ so production can load it too (npm run cli -- permissions:sync).
const PERMISSIONS = PERMISSION_CATALOGUE;
const ROLES = SYSTEM_ROLES;

/** Demo TOTP secret (base32) for the MFA demo user — add it to an authenticator app. */
const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

interface SeedUser {
  username: string;
  email: string;
  fullName: string;
  password: string;
  roles: string[];
  branchCode: string | null;
  status?: UserStatus;
  phoneNumber?: string;
  mfa?: 'TOTP';
}

const USERS: SeedUser[] = [
  {
    username: 'admin',
    email: 'admin@nib.et',
    fullName: 'System Administrator',
    password: 'Admin@12345',
    roles: ['SUPER_ADMIN'],
    branchCode: 'HQ',
  },
  {
    username: 'useradmin',
    email: 'useradmin@nib.et',
    fullName: 'Selam Tesfaye',
    password: 'Passw0rd!2026',
    roles: ['ADMIN'],
    branchCode: 'HQ',
  },
  {
    username: 'manager',
    email: 'manager@nib.et',
    fullName: 'Dawit Bekele',
    password: 'Passw0rd!2026',
    roles: ['BRANCH_MANAGER'],
    branchCode: 'ADD01',
  },
  {
    username: 'auditor',
    email: 'auditor@nib.et',
    fullName: 'Hanna Girma',
    password: 'Passw0rd!2026',
    roles: ['AUDITOR'],
    branchCode: 'HQ',
  },
  {
    username: 'jdoe',
    email: 'jdoe@nib.et',
    fullName: 'Abebe Kebede',
    password: 'Passw0rd!2026',
    roles: ['USER'],
    branchCode: 'ADD01',
    phoneNumber: '+251911000001',
  },
  {
    username: 'mfa.demo',
    email: 'mfa.demo@nib.et',
    fullName: 'Meron Alemu',
    password: 'Passw0rd!2026',
    roles: ['ADMIN'],
    branchCode: 'HQ',
    mfa: 'TOTP',
  },
  // NIB Digital Solutions marketplace
  {
    username: 'product.manager',
    email: 'product.manager@nib.et',
    fullName: 'Yared Tesfaye',
    password: 'Passw0rd!2026',
    roles: ['MARKETPLACE_PRODUCT_MANAGER'],
    branchCode: 'HQ',
  },
  {
    username: 'sales.officer',
    email: 'sales.officer@nib.et',
    fullName: 'Meklit Bekele',
    password: 'Passw0rd!2026',
    roles: ['MARKETPLACE_SALES'],
    branchCode: 'HQ',
  },
];

const FIRST = [
  'Abel',
  'Bethlehem',
  'Chaltu',
  'Dagmawi',
  'Eden',
  'Fikru',
  'Genet',
  'Habtamu',
  'Kidist',
  'Lemma',
  'Mahlet',
  'Natnael',
  'Rahel',
  'Samuel',
  'Tigist',
  'Yonas',
];

const LAST = [
  'Abera',
  'Bekele',
  'Desta',
  'Getachew',
  'Haile',
  'Kassa',
  'Mekonnen',
  'Negash',
  'Tadesse',
  'Worku',
];
const BRANCHES = ['ADD01', 'ADD02', 'BHD01', 'HAW01', 'MEK01'];
const STATUSES: UserStatus[] = [
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'LOCKED',
  'DISABLED',
  'PENDING_ACTIVATION',
];

for (let i = 1; i <= 42; i++) {
  const first = FIRST[i % FIRST.length]!;
  const last = LAST[(i * 7) % LAST.length]!;
  USERS.push({
    username: `${first}.${last}${i}`.toLowerCase(),
    email: `${first}.${last}${i}@nib.et`.toLowerCase(),
    fullName: `${first} ${last}`,
    password: 'Passw0rd!2026',
    roles: ['USER'],
    branchCode: BRANCHES[i % BRANCHES.length]!,
    status: STATUSES[i % STATUSES.length],
    phoneNumber: `+2519${String(10_000_000 + i * 7919).slice(0, 8)}`,
  });
}

async function main(): Promise<void> {
  const mfaKey = process.env.MFA_SECRET_ENCRYPTION_KEY;
  if (!mfaKey) throw new Error('MFA_SECRET_ENCRYPTION_KEY is required to seed');
  const fieldEncryption = new FieldEncryption(Buffer.from(mfaKey, 'base64').subarray(0, 32));

  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description, createdBy: SEED_ACTOR, updatedBy: SEED_ACTOR },
    });
  }

  for (const [code, role] of Object.entries(ROLES)) {
    const saved = await prisma.role.upsert({
      where: { code },
      update: { name: role.name, description: role.description },
      create: {
        code,
        name: role.name,
        description: role.description,
        isSystem: true,
        createdBy: SEED_ACTOR,
        updatedBy: SEED_ACTOR,
      },
    });
    const perms = await prisma.permission.findMany({ where: { code: { in: role.permissions } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: saved.id, permissionId: p.id })),
    });
  }

  const hashCache = new Map<string, string>();
  const hash = async (plain: string): Promise<string> => {
    if (!hashCache.has(plain)) {
      hashCache.set(
        plain,
        await argon2.hash(plain, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
      );
    }
    return hashCache.get(plain)!;
  };

  for (const u of USERS) {
    const data = {
      email: u.email,
      fullName: u.fullName,
      phoneNumber: u.phoneNumber ?? null,
      branchCode: u.branchCode,
      status: u.status ?? 'ACTIVE',
      mfaEnabled: u.mfa === 'TOTP',
      mfaMethod: u.mfa ?? null,
      mfaSecret: u.mfa === 'TOTP' ? fieldEncryption.encrypt(DEMO_TOTP_SECRET) : null,
    };
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: data,
      create: {
        ...data,
        username: u.username,
        passwordHash: await hash(u.password),
        passwordChangedAt: new Date(),
        createdBy: SEED_ACTOR,
        updatedBy: SEED_ACTOR,
      },
    });
    const roles = await prisma.role.findMany({ where: { code: { in: u.roles } } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id, assignedBy: SEED_ACTOR })),
    });
  }

  const lists = await seedReferenceData();
  const messages = await seedWelcomeNotifications();
  const marketplace = await seedMarketplace(prisma, SEED_ACTOR);

  console.log(
    `Seeded ${Object.keys(PERMISSIONS).length} permissions, ${Object.keys(ROLES).length} roles, ${USERS.length} users, ${lists} reference lists, ${messages} notifications.`,
  );
  console.log(
    `Marketplace: ${marketplace.categories} categories, ${marketplace.products} digital products · product.manager, sales.officer / Passw0rd!2026`,
  );
  console.log('Maker–checker demo: changes by admin are approved by useradmin (and vice versa).');
  console.log(
    'Demo logins: admin / Admin@12345 · useradmin, manager, auditor, jdoe / Passw0rd!2026',
  );
  console.log(`MFA demo: mfa.demo / Passw0rd!2026 — TOTP secret ${DEMO_TOTP_SECRET}`);
}

async function seedReferenceData(): Promise<number> {
  for (const list of REFERENCE_DATA) {
    // Plain JSON copy (Prisma's JSON input type has no room for interfaces).
    const attributes = structuredClone<unknown>(list.attributes) as Prisma.InputJsonArray;
    const type = await prisma.referenceDataType.upsert({
      where: { code: list.code },
      update: {
        name: list.name,
        description: list.description,
        attributes,
        parentTypeCode: list.parentTypeCode ?? null,
        isSystem: list.isSystem,
      },
      create: {
        code: list.code,
        name: list.name,
        description: list.description,
        attributes,
        parentTypeCode: list.parentTypeCode ?? null,
        isSystem: list.isSystem,
        createdBy: SEED_ACTOR,
        updatedBy: SEED_ACTOR,
      },
    });
    let order = 0;
    for (const item of list.items) {
      order += 10;
      const data = {
        label: item.label,
        labels: item.am ? { am: item.am } : {},
        parentCode: item.parent ?? null,
        attributes: item.attributes ?? {},
        sortOrder: order,
        active: item.active ?? true,
      };
      await prisma.referenceDataItem.upsert({
        where: { typeId_code: { typeId: type.id, code: item.code } },
        update: data,
        create: {
          ...data,
          typeId: type.id,
          code: item.code,
          createdBy: SEED_ACTOR,
          updatedBy: SEED_ACTOR,
        },
      });
    }
  }
  return REFERENCE_DATA.length;
}

/** A few inbox messages so the notification centre is not empty on first sign-in (once per user). */
async function seedWelcomeNotifications(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { username: { in: ['admin', 'useradmin', 'auditor', 'manager'] } },
    select: { id: true, fullName: true, _count: { select: { notifications: true } } },
  });
  let created = 0;
  const hour = 3_600_000;
  for (const user of users) {
    if (user._count.notifications > 0) continue;
    const messages = [
      {
        category: 'ANNOUNCEMENT',
        severity: 'INFO' as const,
        template: 'announcement',
        title: 'Welcome to NIB Digital Solutions',
        body: `Hello ${user.fullName}, this is the NIB Digital Solutions staff portal. Manage the digital products catalogue, the homepage carousel, demo requests, customer enquiries, ideas and product questions from here.`,
        link: '/dashboard',
        senderName: 'NIB Digital Solutions',
        createdAt: new Date(Date.now() - 26 * hour),
      },
      {
        category: 'SYSTEM',
        severity: 'INFO' as const,
        template: 'announcement',
        title: 'Scheduled maintenance this Saturday 22:00–23:00',
        body: 'Core banking integration will be read-only during the maintenance window. No action is needed.',
        link: null,
        senderName: 'IT Operations',
        createdAt: new Date(Date.now() - 5 * hour),
      },
      {
        category: 'SECURITY',
        severity: 'WARNING' as const,
        template: 'announcement',
        title: 'Protect your account with two-step verification',
        body: 'Add an authenticator app under My profile → Security. It takes less than a minute.',
        link: '/profile?tab=security',
        senderName: 'Security Center',
        createdAt: new Date(Date.now() - 2 * hour),
      },
    ];
    await prisma.notification.createMany({
      data: messages.map((m) => ({ ...m, recipientId: user.id })),
    });
    created += messages.length;
  }
  return created;
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
