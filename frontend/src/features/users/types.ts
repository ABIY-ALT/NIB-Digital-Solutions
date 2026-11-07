import type { ApiSchemas } from '@/shared/api';

/** User as returned by the backend users API (shared contract). */
export type User = ApiSchemas['User'];
export type UserStatus = User['status'];

export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'LOCKED', 'DISABLED', 'PENDING_ACTIVATION'];
