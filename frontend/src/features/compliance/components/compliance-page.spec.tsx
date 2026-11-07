// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, page, renderApp, setLocation } from '@/testing/render';
import type { ComplianceOverview, RetentionRun } from '../types';
import { CompliancePage } from './compliance-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const overview = (overrides: Partial<ComplianceOverview['audit']> = {}): ComplianceOverview => ({
  audit: {
    total: 1234,
    unsealed: 2,
    keyConfigured: false,
    firstSeq: '1',
    lastSeq: '1234',
    oldest: '2025-01-01T00:00:00Z',
    newest: '2026-01-01T00:00:00Z',
    headHash: 'a'.repeat(64),
    ...overrides,
  },
  jobs: [
    {
      name: 'data-retention',
      everyMs: 86_400_000,
      lastStatus: 'success',
      lastError: null,
      lastStartedAt: '2026-01-01T00:00:00Z',
      lastFinishedAt: '2026-01-01T00:01:00Z',
      nextRunAt: '2026-01-02T00:00:00Z',
    },
    {
      name: 'audit-chain-anchor',
      everyMs: 60_000,
      lastStatus: 'failed',
      lastError: 'boom',
      lastStartedAt: null,
      lastFinishedAt: null,
      nextRunAt: null,
    },
  ],
  lockout: { lockoutMinutes: 15, maxFailedAttempts: 5 },
  mfa: { requiredRoles: ['ADMIN'] },
  password: {
    changeOnFirstLogin: true,
    expiryWarningDays: 14,
    historyCount: 5,
    maxAgeDays: 90,
    minAgeHours: 0,
    minLength: 10,
    requireDigit: true,
    requireLowercase: true,
    requireSymbol: true,
    requireUppercase: true,
  },
  retention: {
    enabled: true,
    intervalHours: 24,
    policies: [
      {
        id: 'audit',
        dataset: 'Audit trail',
        description: 'Audit records',
        retentionDays: 2555,
        archive: true,
        basis: 'NBE directive',
      },
      {
        id: 'sessions',
        dataset: 'Sessions',
        description: 'Ended sessions',
        retentionDays: 30,
        archive: false,
        basis: null,
      },
    ],
  },
  session: { absoluteHours: 8, idleTimeoutMinutes: 30, maxConcurrent: 3, newDeviceAlerts: true },
});

const run = (overrides: Partial<RetentionRun> = {}): RetentionRun => ({
  id: 'run-1',
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:01:00Z',
  trigger: 'SCHEDULED',
  dryRun: false,
  status: 'SUCCEEDED',
  triggeredBy: null,
  results: [
    {
      policy: 'audit',
      dataset: 'Audit trail',
      retentionDays: 2555,
      cutoff: '2019-01-01',
      matched: 4,
      purged: 4,
      archived: 4,
      archiveRef: 'archive/run-1/audit.jsonl',
      notes: 'checkpointed',
      error: null,
    },
    {
      policy: 'sessions',
      dataset: 'Sessions',
      retentionDays: 30,
      cutoff: '2025-12-01',
      matched: 1,
      purged: 0,
      archived: 0,
      archiveRef: null,
      notes: null,
      error: 'disk full',
    },
  ],
  ...overrides,
});

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/compliance/overview': overview(),
    'GET /api/compliance/audit/checkpoints': [
      {
        id: 'c1',
        kind: 'ANCHOR',
        seq: '1200',
        fromSeq: null,
        hash: 'b'.repeat(64),
        recordCount: 1200,
        archiveRef: null,
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: null,
      },
      {
        id: 'c2',
        kind: 'PURGE',
        seq: '100',
        fromSeq: '1',
        hash: 'c'.repeat(64),
        recordCount: 100,
        archiveRef: 'x',
        createdAt: '2025-06-01T00:00:00Z',
        createdBy: 'u1',
      },
    ],
    'POST /api/compliance/audit/verify': {
      status: 'BROKEN',
      checked: 10,
      durationMs: 5,
      anchorsChecked: 1,
      firstSeq: '1',
      lastSeq: '10',
      headHash: 'x',
      startsAfterPurge: null,
      verifiedAt: '2026-01-01T00:00:00Z',
      break: { seq: '7', id: 'rec-7', reason: 'HASH_MISMATCH' },
    },
    'POST /api/compliance/audit/anchor': { id: 'c3' },
    'GET /api/compliance/retention/preview': [
      { policy: 'audit', cutoff: '2019-01-01', matched: 4 },
    ],
    'GET /api/compliance/retention/runs': page(
      [run(), run({ id: 'run-2', dryRun: true, trigger: 'MANUAL', status: 'FAILED' })],
      { pageSize: 2, total: 4 },
    ),
    'POST /api/compliance/retention/run': ({ body }: { body: unknown }) =>
      run({ id: 'run-9', dryRun: (body as { dryRun: boolean }).dryRun }),
    'POST /api/compliance/jobs/data-retention/run': { result: 'ran' },
    'POST /api/compliance/jobs/audit-chain-anchor/run': { result: 'skipped' },
    ...extra,
  });
}

const MANAGE = ['compliance:read', 'compliance:manage'];

describe('CompliancePage', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  });

  it('shows the effective policies and switches tabs through the URL', async () => {
    setLocation('/compliance');
    routes();
    renderApp(<CompliancePage />, { permissions: MANAGE });
    expect(await screen.findAllByText(/90/)).toBeTruthy();
    const tab = screen.getByRole('tab', { name: /Data retention/ });
    fireEvent.mouseDown(tab);
    fireEvent.keyDown(tab, { key: 'Enter' });
    fireEvent.click(tab);
    fireEvent.focus(tab);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/compliance?tab=retention', {
        scroll: false,
      }),
    );
    const policies = screen.getByRole('tab', { name: /Policies/ });
    fireEvent.mouseDown(policies);
    fireEvent.click(policies);
    fireEvent.focus(policies);
  });

  it('verifies the audit chain, records anchors and copies the head hash', async () => {
    setLocation('/compliance', 'tab=integrity');
    const api = routes();
    renderApp(<CompliancePage />, { permissions: MANAGE });
    expect(await screen.findByText('1,234')).toBeTruthy();
    expect(await screen.findByText('#1200')).toBeTruthy();
    expect(screen.getByText(/#1 – #100/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Verify now/ }));
    expect(await screen.findByText(/rec-7/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Record anchor/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/compliance/audit/anchor')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy chain head hash' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('reports a verified chain, an empty trail, and failures', async () => {
    setLocation('/compliance', 'tab=integrity');
    routes({
      'GET /api/compliance/overview': overview({
        total: 0,
        unsealed: 0,
        keyConfigured: true,
        firstSeq: null,
        lastSeq: null,
        oldest: null,
        headHash: null,
      }),
      'GET /api/compliance/audit/checkpoints': [],
      'POST /api/compliance/audit/verify': {
        status: 'INTACT',
        checked: 0,
        durationMs: 1,
        anchorsChecked: 0,
        break: null,
      },
      'POST /api/compliance/audit/anchor': new ApiFailure(400, 'BAD_REQUEST'),
    });
    renderApp(<CompliancePage />, { permissions: MANAGE });
    fireEvent.click(await screen.findByRole('button', { name: /Verify now/ }));
    fireEvent.click(screen.getByRole('button', { name: /Record anchor/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Copy chain head hash' })).toBeNull();
  });

  it('reports a failed verification', async () => {
    setLocation('/compliance', 'tab=integrity');
    const api = routes({ 'POST /api/compliance/audit/verify': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<CompliancePage />, { permissions: ['compliance:read'] });
    fireEvent.click(await screen.findByRole('button', { name: /Verify now/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/compliance/audit/verify')).toBe(true),
    );
    expect(screen.queryByRole('button', { name: /Record anchor/ })).toBeNull();
  });

  it('runs retention as a dry run and for real, and pages the history', async () => {
    setLocation('/compliance', 'tab=retention');
    const api = routes();
    renderApp(<CompliancePage />, { permissions: MANAGE });
    expect(await screen.findByText('NBE directive')).toBeTruthy();
    await screen.findAllByRole('row');

    fireEvent.click(screen.getByRole('button', { name: /Dry run/ }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === 'POST' && (c.body as { dryRun: boolean }).dryRun),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: /Run now/ }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Run now/ }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) => c.method === 'POST' && (c.body as { dryRun: boolean }).dryRun === false,
        ),
      ).toBe(true),
    );

    // Expand and collapse a past run, then page.
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows.at(-1)!);
    expect(await screen.findByText('disk full')).toBeTruthy();
    fireEvent.click(rows.at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) => c.path === '/api/compliance/retention/runs' && c.query.get('page') === '2',
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
  });

  it('reports a failed retention run, and shows when retention is off', async () => {
    setLocation('/compliance', 'tab=retention');
    const base = overview();
    routes({
      'GET /api/compliance/overview': { ...base, retention: { ...base.retention, enabled: false } },
      'GET /api/compliance/retention/runs': page([]),
      'POST /api/compliance/retention/run': new ApiFailure(400, 'BAD_REQUEST'),
    });
    renderApp(<CompliancePage />, { permissions: MANAGE });
    expect(await screen.findByText('No retention runs yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Run now/ }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Run now/ }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('lists background jobs and runs one', async () => {
    setLocation('/compliance', 'tab=jobs');
    const api = routes();
    renderApp(<CompliancePage />, { permissions: MANAGE });
    const jobs = () => api.calls.filter((c) => c.path.startsWith('/api/compliance/jobs/'));
    fireEvent.click((await screen.findAllByRole('button', { name: /Run now/ }))[0]!);
    await waitFor(() => expect(jobs()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Run now/ })[1]!.hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Run now/ })[1]!);
    await waitFor(() => expect(jobs()).toHaveLength(2));
  });

  it('retries when the overview fails', async () => {
    setLocation('/compliance');
    const api = routes({ 'GET /api/compliance/overview': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<CompliancePage />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
