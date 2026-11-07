import { ApiClientError } from '@/shared/errors/api-client-error';
import { isApiErrorResponse } from '@/shared/types';

export interface DownloadResult {
  fileName: string;
  /** Rows reported by export endpoints (x-export-rows). */
  rows?: number;
  truncated?: boolean;
}

function fileNameFrom(disposition: string | null, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '');
  if (star?.[1]) return decodeURIComponent(star[1]);
  return /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1] ?? fallback;
}

/**
 * Downloads a file from a BFF endpoint (same-origin, session cookie). API
 * errors come back as the standard envelope and are thrown as ApiClientError,
 * so callers show them like any other error.
 */
export async function downloadFromApi(
  path: string,
  query: URLSearchParams,
  fallbackName: string,
): Promise<DownloadResult> {
  const res = await fetch(`${path}?${query.toString()}`, {
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'appcore', 'x-correlation-id': crypto.randomUUID() },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw isApiErrorResponse(body)
      ? ApiClientError.fromEnvelope(body, res.status, res.headers.get('retry-after'))
      : new ApiClientError({
          code: 'UNKNOWN_ERROR',
          message: 'The download failed.',
          status: res.status,
        });
  }
  const fileName = fileNameFrom(res.headers.get('content-disposition'), fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return {
    fileName,
    rows: Number(res.headers.get('x-export-rows') ?? '') || undefined,
    truncated: res.headers.get('x-export-truncated') === 'true',
  };
}
