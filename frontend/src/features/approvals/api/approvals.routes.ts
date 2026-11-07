import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { ApiData } from '@/shared/api';

/**
 * Maker–checker BFF routes → NestJS /approvals. Any signed-in user reaches
 * them (their own requests); the backend decides what each user may see and
 * decide (entitlement, four-eyes rule).
 */
const seg = (id: string) => encodeURIComponent(id);
const LIST_PARAMS = [
  'box',
  'status',
  'action',
  'resourceType',
  'resourceId',
  'search',
  'page',
  'pageSize',
];

/** Copies only the known list parameters (bounded) to the backend query. */
function listQuery(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  for (const key of LIST_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) query[key] = value.slice(0, 200);
  }
  return query;
}

export const listApprovals = apiRoute<ApiData<'GET /approvals'>>({}, async ({ req, api }) => {
  const res = await api.get<ApiData<'GET /approvals'>>('/approvals', { query: listQuery(req) });
  return { data: res.data, meta: res.meta };
});

export const approvalSummary = apiRoute<ApiData<'GET /approvals/summary'>>({}, async ({ api }) => ({
  data: (await api.get<ApiData<'GET /approvals/summary'>>('/approvals/summary')).data,
}));

export const approvalPolicy = apiRoute<ApiData<'GET /approvals/policy'>>({}, async ({ api }) => ({
  data: (await api.get<ApiData<'GET /approvals/policy'>>('/approvals/policy')).data,
}));

export const pendingApprovals = apiRoute<Record<string, string>>({}, async ({ req, api }) => {
  const url = new URL(req.url);
  const resourceType = url.searchParams.get('resourceType') ?? '';
  const ids = url.searchParams.get('ids') ?? '';
  return {
    data: (
      await api.get<Record<string, string>>('/approvals/pending', {
        query: { resourceType: resourceType.slice(0, 64), ids: ids.slice(0, 8_000) },
      })
    ).data,
  };
});

export const getApproval = apiRoute<ApiData<'GET /approvals/{id}'>, { id: string }>(
  {},
  async ({ api, params }) => ({
    data: (await api.get<ApiData<'GET /approvals/{id}'>>(`/approvals/${seg(params.id)}`)).data,
  }),
);

const approveBody = z.object({ comment: z.string().trim().max(1000).nullish() });
const rejectBody = z.object({ comment: z.string().trim().min(3).max(1000) });

export const approveRequest = apiRoute<ApiData<'POST /approvals/{id}/approve'>, { id: string }>(
  { requires: { permission: 'approvals:approve' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(approveBody));
    const res = await api.post<ApiData<'POST /approvals/{id}/approve'>>(
      `/approvals/${seg(params.id)}/approve`,
      body,
    );
    return { data: res.data, message: res.message };
  },
);

export const rejectRequest = apiRoute<ApiData<'POST /approvals/{id}/reject'>, { id: string }>(
  { requires: { permission: 'approvals:approve' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(rejectBody));
    const res = await api.post<ApiData<'POST /approvals/{id}/reject'>>(
      `/approvals/${seg(params.id)}/reject`,
      body,
    );
    return { data: res.data, message: res.message };
  },
);

export const cancelRequest = apiRoute<ApiData<'POST /approvals/{id}/cancel'>, { id: string }>(
  {},
  async ({ api, params }) => {
    const res = await api.post<ApiData<'POST /approvals/{id}/cancel'>>(
      `/approvals/${seg(params.id)}/cancel`,
    );
    return { data: res.data, message: res.message };
  },
);
