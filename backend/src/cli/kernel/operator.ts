import { randomUUID } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import type { Principal } from '#core/application/security/principal.js';

/** The person running the CLI, as recorded in audit records and `created_by` columns. */
export interface Operator {
  /** Actor id (`cli:<name>`, at most 64 characters — the width of the actor columns). */
  id: string;
  /** Actor username shown in the audit log (`cli:<name>@<host>`). */
  username: string;
  name: string;
  host: string;
  /** Operating-system account the process runs as (may differ from `name` under a shared account). */
  osUser: string;
}

const ACTOR_COLUMN_WIDTH = 64;
const clean = (value: string): string => value.replace(/[^A-Za-z0-9._@-]/g, '_');

function osAccount(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? 'unknown';
  }
}

/**
 * Identity precedence: --operator, then APPCORE_OPERATOR, then the OS account.
 * Under a shared service account (a container shell, a pipeline) set one of the
 * first two so the audit trail names the person, not the account.
 */
export function resolveOperator(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Operator {
  const osUser = clean(osAccount());
  const name = clean((explicit ?? env.APPCORE_OPERATOR ?? '').trim()) || osUser;
  const host = clean(hostname());
  return {
    id: `cli:${name}`.slice(0, ACTOR_COLUMN_WIDTH),
    username: `cli:${name}@${host}`.slice(0, ACTOR_COLUMN_WIDTH),
    name,
    host,
    osUser,
  };
}

/**
 * Whoever can run the CLI already holds the database credentials, so the
 * operator acts with full authority. What the CLI adds is accountability:
 * every change is attributed to the operator and written to the audit trail.
 */
export function operatorPrincipal(operator: Operator): Principal {
  return {
    userId: operator.id,
    username: operator.username,
    sessionId: `cli-${randomUUID()}`,
    roles: ['SYSTEM_OPERATOR'],
    permissions: ['*'],
    attributes: {},
    mfaVerified: true,
    authMethod: 'external',
  };
}
