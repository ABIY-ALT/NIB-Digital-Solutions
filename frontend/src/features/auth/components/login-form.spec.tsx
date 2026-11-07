// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, renderApp } from '@/testing/render';
import { LoginForm } from './login-form';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());
const sso = vi.hoisted(() => vi.fn());
vi.mock('next-auth/react', () => ({ signIn: sso }));

const form = (props: Partial<Parameters<typeof LoginForm>[0]> = {}) => (
  <LoginForm ssoEnabled={false} ssoName="Entra ID" credentialStorage="block" {...props} />
);

function signInAs(username: string, password: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.push.mockClear();
    navigation.refresh.mockClear();
  });

  it('signs in and goes to the requested page', async () => {
    const api = mockApi({
      'POST /api/auth/login': { status: 'AUTHENTICATED', redirectTo: '/users' },
    });
    renderApp(form({ callbackUrl: '/users' }));
    signInAs(' ada ', 'Secret#2026');
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/users'));
    expect(navigation.refresh).toHaveBeenCalled();
    expect(api.calls[0]!.body).toEqual({
      username: 'ada',
      password: 'Secret#2026',
      callbackUrl: '/users',
    });
  });

  it('continues to the next sign-in step', async () => {
    mockApi({ 'POST /api/auth/login': { status: 'MFA_REQUIRED', redirectTo: '/login/mfa' } });
    renderApp(form({ credentialStorage: 'allow' }));
    signInAs('ada', 'Secret#2026');
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/login/mfa'));
  });

  it('explains a refused sign-in and counts down a lock-out', async () => {
    mockApi({ 'POST /api/auth/login': new ApiFailure(429, 'rate_limited', 'Too many', 90) });
    renderApp(form({ reason: 'idle' }));
    expect(screen.getByText('You were signed out after a period of inactivity.')).toBeTruthy();
    signInAs('ada', 'wrong');
    expect(
      await screen.findByText('Too many attempts. Please wait a minute and try again.'),
    ).toBeTruthy();
    expect((await screen.findAllByText(/Try again in 1:\d\d/)).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: /Try again in/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Password', { selector: 'input' }) as HTMLInputElement).value,
    ).toBe('');
  });

  it('treats unknown failures as unavailable', async () => {
    mockApi({ 'POST /api/auth/login': new ApiFailure(500, 'SOMETHING_ELSE') });
    renderApp(form());
    signInAs('ada', 'x');
    expect(await screen.findByText(/temporarily unavailable/)).toBeTruthy();
  });

  it('validates the fields before calling the server', async () => {
    const api = mockApi({});
    renderApp(form());
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(api.calls).toHaveLength(0);
  });

  it('shows the initial error and success notices', () => {
    const view = renderApp(form({ initialError: 'account_locked', reason: 'expired' }));
    expect(screen.getByText(/temporarily locked/)).toBeTruthy();
    expect(screen.queryByText(/session has expired/)).toBeNull();
    view.unmount();
    renderApp(form({ initialError: 'not_a_code' as never, reason: 'signed_out' }));
    expect(screen.getByText('You have signed out successfully.')).toBeTruthy();
  });

  it('offers help or a reset link for a forgotten password, and single sign-on', async () => {
    const view = renderApp(form({ ssoEnabled: true, callbackUrl: '/roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(await screen.findByText('Reset your password')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Entra ID' }));
    await waitFor(() => expect(sso).toHaveBeenCalledWith('oidc', { redirectTo: '/roles' }));
    view.unmount();

    renderApp(form({ ssoEnabled: true, forgotPasswordUrl: '/forgot-password' }));
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Entra ID' }));
    await waitFor(() => expect(sso).toHaveBeenLastCalledWith('oidc', { redirectTo: '/dashboard' }));
  });
});
