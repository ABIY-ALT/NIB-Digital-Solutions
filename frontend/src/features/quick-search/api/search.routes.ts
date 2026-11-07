import { apiRoute } from '@/features/auth/api/api-route';
import { hasPermission } from '@/features/auth/permissions';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { logger } from '@/infrastructure/logging/logger';
import type { ApiData } from '@/shared/api';
import type { QuickSearchRecord, QuickSearchResponse } from '../types';

/**
 * GET /api/search?q= — federated record search for the quick search
 * dialog. One request fans out (in parallel, server-side) to every source the
 * signed-in user may read; each source is bounded, time-limited and isolated,
 * so a slow or failing module never breaks the others. Results carry only
 * what the dialog shows.
 *
 * To make a feature searchable, add a source here.
 */
interface SearchSource {
  id: QuickSearchRecord['source'];
  permission: string;
  search: (api: BoundBackendClient, q: string) => Promise<QuickSearchRecord[]>;
}

const PER_SOURCE = 5;
const SOURCE_TIMEOUT_MS = 2_500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;

const SOURCES: SearchSource[] = [
  {
    id: 'users',
    permission: 'users:read',
    search: async (api, q) =>
      (
        await api.get<ApiData<'GET /users'>>('/users', {
          query: { search: q, pageSize: String(PER_SOURCE) },
        })
      ).data.map((u) => ({
        id: u.id,
        source: 'users',
        title: u.fullName,
        subtitle: `${u.username} · ${u.email}`,
        badge: u.status,
        href: `/users?search=${enc(u.username)}`,
      })),
  },
  {
    id: 'roles',
    permission: 'roles:read',
    search: async (api, q) =>
      (
        await api.get<ApiData<'GET /roles'>>('/roles', {
          query: { search: q, pageSize: String(PER_SOURCE) },
        })
      ).data.map((r) => ({
        id: r.id,
        source: 'roles',
        title: r.name,
        subtitle: r.code,
        href: `/roles?search=${enc(r.code)}`,
      })),
  },
  {
    id: 'reference-data',
    permission: 'reference-data:read',
    search: async (api, q) =>
      (
        await api.get<ApiData<'GET /reference-data/types'>>('/reference-data/types', {
          query: { search: q, pageSize: String(PER_SOURCE) },
        })
      ).data.map((t) => ({
        id: t.id,
        source: 'reference-data',
        title: t.name,
        subtitle: t.code,
        href: `/reference-data?list=${enc(t.code)}`,
      })),
  },
  {
    id: 'approvals',
    permission: 'approvals:read',
    search: async (api, q) =>
      (
        await api.get<ApiData<'GET /approvals'>>('/approvals', {
          query: { box: 'all', search: q, pageSize: String(PER_SOURCE) },
        })
      ).data.map((a) => ({
        id: a.id,
        source: 'approvals',
        title: a.summary,
        subtitle: a.action,
        badge: a.status,
        href: `/approvals?box=all&id=${enc(a.id)}`,
      })),
  },
  {
    // Investigators paste a correlation / record id: find the audit events.
    id: 'audit',
    permission: 'audit:read',
    search: async (api, q) => {
      if (!UUID.test(q)) return [];
      const res = await api.get<ApiData<'GET /audit-logs'>>('/audit-logs', {
        query: { search: q, pageSize: String(PER_SOURCE), sort: 'occurredAt:desc' },
      });
      return res.data.map((e) => ({
        id: e.id,
        source: 'audit',
        title: e.action,
        subtitle: [e.actorUsername, e.resourceType, e.occurredAt.slice(0, 16).replace('T', ' ')]
          .filter(Boolean)
          .join(' · '),
        badge: e.outcome,
        href: `/audit?id=${enc(e.id)}`,
      }));
    },
  },
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export const quickSearch = apiRoute<QuickSearchResponse>(
  {},
  async ({ req, api, user, correlationId }) => {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    if (q.length < 2) return { data: { query: q, records: [], failed: [] } };
    const sources = SOURCES.filter((s) => hasPermission(user.permissions, s.permission));
    const settled = await Promise.allSettled(
      sources.map((s) => withTimeout(s.search(api, q), SOURCE_TIMEOUT_MS)),
    );
    const records: QuickSearchRecord[] = [];
    const failed: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') records.push(...r.value);
      else {
        failed.push(sources[i]!.id);
        logger.warn(
          { correlationId, source: sources[i]!.id, err: String(r.reason) },
          'Quick search source failed',
        );
      }
    });
    return { data: { query: q, records, failed } };
  },
);
