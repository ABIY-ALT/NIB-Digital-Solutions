import { getLocale } from 'next-intl/server';
import { apiRoute } from '@/features/auth/api/api-route';
import { ApiClientError } from '@/shared/errors/api-client-error';
import type { ApiData } from '@/shared/api';

/**
 * Record-picker options → NestJS /options/{source}. Any signed-in user may call
 * it; the backend checks each source's permissions (and row scope). Labels come
 * back in the reader's locale.
 */
const SOURCE = /^[a-z][a-z0-9-]{1,63}(\.[a-z0-9][a-z0-9-]{0,63})?$/;
const PASS_THROUGH = ['page', 'pageSize', 'search', 'values', 'parent'] as const;
const MAX_LENGTH: Record<(typeof PASS_THROUGH)[number], number> = {
  page: 6,
  pageSize: 3,
  search: 100,
  values: 10_000,
  parent: 64,
};

export const listOptions = apiRoute<ApiData<'GET /options/{source}'>, { source: string }>(
  {},
  async ({ req, api, params }) => {
    const source = params.source.toLowerCase();
    if (!SOURCE.test(source)) {
      throw new ApiClientError({
        code: 'NOT_FOUND',
        message: 'Unknown option source.',
        status: 404,
      });
    }
    const url = new URL(req.url);
    const query: Record<string, string> = { locale: await getLocale() };
    for (const key of PASS_THROUGH) {
      const value = url.searchParams.get(key)?.trim();
      if (value) query[key] = value.slice(0, MAX_LENGTH[key]);
    }
    const res = await api.get<ApiData<'GET /options/{source}'>>(
      `/options/${encodeURIComponent(source)}`,
      { query },
    );
    return { data: res.data, meta: res.meta };
  },
);
