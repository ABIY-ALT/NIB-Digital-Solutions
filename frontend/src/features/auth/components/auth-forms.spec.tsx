// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, renderApp } from '@/testing/render';
import { MfaForm } from './mfa-form';
import { PasswordChangeForm } from './password-change-form';
import { InvalidResetLink, ResetPasswordForm } from './reset-password-form';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

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

const typeCode = (code: string) => {
  const input = screen.getAllByRole('textbox')[0]!;
  fireEvent.change(input, { target: { value: code } });
};

beforeEach(() => {
  navigation.replace.mockClear();
  navigation.refresh.mockClear();
});

describe('MfaForm', () => {
  afterEach(() => vi.useRealTimers());

  it('verifies a complete code and continues', async () => {
    const api = mockApi({
      'POST /api/auth/mfa': { status: 'AUTHENTICATED', redirectTo: '/dashboard' },
    });
    renderApp(<MfaForm method="TOTP" callbackUrl="/dashboard" />);
    expect(screen.getByText(/authenticator app/)).toBeTruthy();
    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/dashboard'));
    expect(api.calls[0]!.body).toMatchObject({ code: '123456', callbackUrl: '/dashboard' });
  });

  it('refuses an incomplete code and shows wrong and expired codes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi({ 'POST /api/auth/mfa': new ApiFailure(401, 'mfa_expired') });
    renderApp(<MfaForm method="SMS" hint="+251 9•• ••• 123" />);
    expect(screen.getByText('+251 9•• ••• 123')).toBeTruthy();
    fireEvent.submit(screen.getByRole('button', { name: 'Verify' }).closest('form')!);
    expect(await screen.findByText(/incorrect/i)).toBeTruthy();
    typeCode('654321');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/expired/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    expect(navigation.replace).toHaveBeenCalledWith('/login');
  });
});

describe('PasswordChangeForm', () => {
  afterEach(() => vi.useRealTimers());

  it('sets a new password that meets the policy and continues', async () => {
    const api = mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/auth/password': { status: 'AUTHENTICATED', redirectTo: '/users' },
    });
    renderApp(
      <PasswordChangeForm reason="EXPIRED" callbackUrl="/users" credentialStorage="allow" />,
    );
    expect(screen.getByText(/has expired/)).toBeTruthy();
    const [password, confirm] = screen.getAllByPlaceholderText(/new password/i);
    fireEvent.change(password!, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.change(confirm!, { target: { value: 'Different#1' } });
    fireEvent.click(screen.getByRole('button', { name: /Set password/ }));
    expect(await screen.findByText('The passwords do not match')).toBeTruthy();
    fireEvent.change(confirm!, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.click(screen.getByRole('button', { name: /Set password/ }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/users'));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      newPassword: 'Kx9#mPq2Lw!7',
    });
  });

  it('shows policy violations from the server, and an expired change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let expired = false;
    mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/auth/password': () =>
        expired
          ? new ApiFailure(401, 'password_change_expired')
          : new ApiFailure(400, 'VALIDATION_FAILED'),
    });
    renderApp(<PasswordChangeForm reason="RESET" credentialStorage="block" />);
    expect(screen.getByText(/set by an administrator/)).toBeTruthy();
    const [password, confirm] = screen.getAllByPlaceholderText(/new password/i);
    for (const input of [password!, confirm!])
      fireEvent.change(input, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.click(screen.getByRole('button', { name: /Set password/ }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expired = true;
    fireEvent.click(screen.getByRole('button', { name: /Set password/ }));
    expect(
      await screen
        .findByText(/expired/i, { selector: '[role="alert"] *, [role="alert"]' })
        .catch(() => screen.findAllByText(/expired/i)),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login?reason=expired'));
  });
});

describe('ResetPasswordForm', () => {
  it('changes the password with the e-mailed link and goes to sign-in', async () => {
    const api = mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/auth/password/reset': null,
    });
    renderApp(<ResetPasswordForm token={'t'.repeat(32)} credentialStorage="allow" />);
    const inputs = screen.getAllByPlaceholderText(/password/i);
    for (const input of inputs) fireEvent.change(input, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/auth/password/reset')).toBe(true),
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
  });

  it('reports a used link and invalid input', async () => {
    mockApi({
      'GET /api/auth/password-policy': policy,
      'POST /api/auth/password/reset': new ApiFailure(400, 'AUTH_PASSWORD_RESET_INVALID'),
    });
    renderApp(<ResetPasswordForm token={'t'.repeat(32)} credentialStorage="block" />);
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    const inputs = screen.getAllByPlaceholderText(/password/i);
    fireEvent.change(inputs[0]!, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.change(inputs.at(-1)!, { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect((await screen.findAllByText(/no longer works|invalid|expired/i)).length).toBeGreaterThan(
      0,
    );
  });

  it('explains an invalid link', () => {
    renderApp(<InvalidResetLink />);
    expect(screen.getByText('This link no longer works')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy();
  });
});
