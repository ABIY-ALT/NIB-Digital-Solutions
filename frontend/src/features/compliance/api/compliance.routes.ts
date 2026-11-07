import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { ApiData } from '@/shared/api';
import type { RetentionPreview } from '../types';

/** Security & compliance console BFF routes → NestJS /compliance. */
const READ = { requires: { permission: 'compliance:read' } } as const;
const MANAGE = { requires: { permission: 'compliance:manage' } } as const;

export const overview = apiRoute<ApiData<'GET /compliance/overview'>>(READ, async ({ api }) => ({
  data: (await api.get<ApiData<'GET /compliance/overview'>>('/compliance/overview')).data,
}));

export const verifyAudit = apiRoute<ApiData<'POST /compliance/audit/verify'>>(
  READ,
  async ({ api }) => ({
    data: (
      await api.post<ApiData<'POST /compliance/audit/verify'>>(
        '/compliance/audit/verify',
        undefined,
        {
          timeoutMs: 120_000,
        },
      )
    ).data,
  }),
);

export const checkpoints = apiRoute<ApiData<'GET /compliance/audit/checkpoints'>>(
  READ,
  async ({ api }) => ({
    data: (
      await api.get<ApiData<'GET /compliance/audit/checkpoints'>>('/compliance/audit/checkpoints')
    ).data,
  }),
);

export const anchor = apiRoute<unknown>(MANAGE, async ({ api }) => {
  const res = await api.post('/compliance/audit/anchor');
  return { data: res.data, message: res.message };
});

export const retentionPreview = apiRoute<RetentionPreview[]>(READ, async ({ api }) => ({
  data: (await api.get<RetentionPreview[]>('/compliance/retention/preview')).data,
}));

const runBody = z.object({ dryRun: z.boolean() });

export const runRetention = apiRoute<ApiData<'POST /compliance/retention/run'>>(
  MANAGE,
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(runBody));
    const res = await api.post<ApiData<'POST /compliance/retention/run'>>(
      '/compliance/retention/run',
      body,
      {
        timeoutMs: 300_000,
      },
    );
    return { data: res.data, message: res.message };
  },
);

export const retentionRuns = apiRoute<ApiData<'GET /compliance/retention/runs'>>(
  READ,
  async ({ req, api }) => {
    const url = new URL(req.url);
    const page = String(Math.max(1, Number(url.searchParams.get('page')) || 1));
    const res = await api.get<ApiData<'GET /compliance/retention/runs'>>(
      '/compliance/retention/runs',
      {
        query: { page, pageSize: '10' },
      },
    );
    return { data: res.data, meta: res.meta };
  },
);

export const triggerJob = apiRoute<{ result: 'ran' | 'skipped' }, { name: string }>(
  MANAGE,
  async ({ api, params }) => {
    if (!/^[a-z0-9-]{2,64}$/.test(params.name)) {
      return { data: { result: 'skipped' as const }, status: 400 };
    }
    const res = await api.post<{ result: 'ran' | 'skipped' }>(
      `/compliance/jobs/${params.name}/run`,
      undefined,
      {
        timeoutMs: 300_000,
      },
    );
    return { data: res.data, message: res.message };
  },
);
