// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/shared/types';
import { ApiFailure, mockApi, renderApp } from '@/testing/render';
import { SecurityPanel } from './security-panel';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());
vi.mock('qrcode', () => ({ toDataURL: () => Promise.resolve('data:image/png;base64,QR') }));

const profile = (overrides: Partial<UserProfile> = {}) =>
  ({
    id: 'u1',
    username: 'ada',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    mfaEnabled: false,
    mfaMethod: null,
    mfaRequired: false,
    passwordChangedAt: '2026-01-01T00:00:00Z',
    passwordExpiresAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }) as UserProfile;

const policy = {
  minLength: 10,
  maxLength: 256,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
  historyCount: 5,
  disallowCommon: true,
  disallowPersonalInfo: true,
  maxAgeDays: 90,
  minAgeHours: 0,
  expiryWarningDays: 14,
};

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe('SecurityPanel', () => {
  it('changes the password, checking the confirmation', async () => {
    const api = mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/account/password': { terminatedSessions: 2 },
    });
    renderApp(<SecurityPanel profile={profile()} />);
    const current = screen.getAllByLabelText(/Current password/, { selector: 'input' })[0]!;
    const next = screen.getAllByLabelText(/^New password/, { selector: 'input' })[0]!;
    const confirm = screen.getAllByLabelText(/Confirm new password/, { selector: 'input' })[0]!;
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Enter your current password.')).toBeTruthy();
    fireEvent.change(current, { target: { value: 'Old#Pass2026' } });
    fireEvent.change(next, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.change(confirm, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The passwords do not match.')).toBeTruthy();
    fireEvent.change(confirm, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/account/password')).toBe(true),
    );
  });

  it('sets up an authenticator app: QR code, manual key, wrong and right codes', async () => {
    let attempts = 0;
    const api = mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/account/mfa/setup': { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' },
      'POST /api/account/mfa/confirm': () =>
        ++attempts === 1 ? new ApiFailure(400, 'AUTH_MFA_INVALID_CODE') : null,
    });
    renderApp(<SecurityPanel profile={profile({ mfaRequired: true })} />);
    expect(screen.getByText('Two-step verification is recommended')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Set up/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByAltText(/QR code/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy key' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');

    const code = within(dialog).getAllByRole('textbox')[0]!;
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Verify and turn on/ }));
    expect(await within(dialog).findByText(/not valid/)).toBeTruthy();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Verify and turn on/ }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.path === '/api/account/mfa/confirm')).toHaveLength(2),
    );
  });

  it('reports a set-up that cannot start', async () => {
    mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/account/mfa/setup': new ApiFailure(503, 'SERVICE_UNAVAILABLE', 'Down'),
    });
    renderApp(<SecurityPanel profile={profile()} />);
    fireEvent.click(screen.getByRole('button', { name: /Set up/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Down|Could not start/)).toBeTruthy();
    fireEvent.click(
      within(dialog)
        .getAllByRole('button', { name: /Cancel/ })
        .at(-1)!,
    );
  });

  it('turns two-step verification off with the password', async () => {
    const api = mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/account/mfa/disable': null,
    });
    renderApp(<SecurityPanel profile={profile({ mfaEnabled: true, mfaMethod: 'TOTP' })} />);
    expect(screen.getByText('Codes are generated by your authenticator app.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Turn off/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    expect(await within(dialog).findByText('Enter your current password.')).toBeTruthy();
    fireEvent.change(
      within(dialog).getAllByLabelText(/Current password/, { selector: 'input' })[0]!,
      { target: { value: 'My#Pass2026' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/account/mfa/disable')).toBe(true),
    );
  });
});
