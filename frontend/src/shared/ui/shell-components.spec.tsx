// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { Home, Settings, Shield, Sun } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { openMenu, renderApp } from '@/testing/render';
import { AccountMenu, type AccountMenuProps } from './account-menu';
import { Breadcrumbs } from './breadcrumbs';
import { CommandPalette, type CommandGroup, type CommandItem } from './command-palette';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

describe('Breadcrumbs', () => {
  const trail = [
    { label: 'Home', href: '/', icon: <Home /> },
    { label: 'Administration', href: '/admin' },
    { label: 'Security' },
    { label: 'Roles', href: '/roles' },
    {
      label: 'Teller',
      siblings: [
        { label: 'Teller', href: '/roles/1', active: true },
        { label: 'Auditor', href: '/roles/2', icon: <Shield /> },
      ],
    },
  ];

  it('collapses a long trail and reveals the hidden crumbs', async () => {
    renderApp(<Breadcrumbs items={trail} maxItems={4} separator="slash" home="icon" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).queryByText('Administration')).toBeNull();
    const menu = await openMenu(within(nav).getByRole('button', { name: 'Show hidden path' }));
    expect(within(menu).getByText('Administration')).toBeTruthy();
    expect(within(menu).getByText('Security')).toBeTruthy();
  });

  it('marks the current page and switches between siblings', async () => {
    renderApp(
      <Breadcrumbs
        items={trail}
        maxItems={10}
        separator="dot"
        size="md"
        labels={{ switchTo: 'Go to' }}
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /Administration/ })).toBeTruthy();
    expect(within(nav).getByText('Security').closest('[title]')).toBeTruthy();
    const switcher = within(nav).getByRole('button', { name: /Teller/ });
    expect(switcher.getAttribute('aria-current')).toBe('page');
    const menu = await openMenu(switcher);
    expect(within(menu).getByRole('menuitem', { name: /Auditor/ })).toBeTruthy();
  });

  it('shows a plain current crumb, a custom separator, and nothing for an empty trail', () => {
    const { container } = renderApp(
      <>
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]}
          separator={<span>›</span>}
          home="none"
        />
        <Breadcrumbs items={[]} />
      </>,
    );
    expect(screen.getByText('Profile').closest('[aria-current="page"]')).toBeTruthy();
    expect(container.querySelectorAll('nav')).toHaveLength(1);
    expect(screen.getByText('›')).toBeTruthy();
  });
});

describe('CommandPalette', () => {
  const groups: CommandGroup[] = [
    {
      id: 'pages',
      label: 'Pages',
      items: [
        { id: 'users', label: 'Users', indices: [0, 1], description: 'Manage users', hint: 'Open' },
        {
          id: 'roles',
          label: 'Roles',
          badge: <span>new</span>,
          secondary: { label: 'Forget', icon: <Settings />, onSelect: vi.fn() },
        },
      ],
    },
    { id: 'records', label: 'Records', items: [{ id: 'r:1', label: 'Ada Lovelace' }] },
    { id: 'remote', label: 'Remote', items: [], loading: true },
  ];
  const labels = {
    title: 'Search',
    placeholder: 'Search everything',
    close: 'Close',
    navigate: 'navigate',
    select: 'select',
    dismiss: 'dismiss',
    loading: 'Loading…',
  };

  function Palette({
    initialGroups = groups,
    initialQuery = '',
    onSelect,
  }: Readonly<{
    initialGroups?: CommandGroup[];
    initialQuery?: string;
    onSelect: (i: CommandItem) => void;
  }>) {
    const [query, setQuery] = useState(initialQuery);
    return (
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        query={query}
        onQueryChange={setQuery}
        groups={initialGroups}
        onSelect={onSelect}
        labels={labels}
        busy
        idle={<p>Try a page name</p>}
        empty={<p>Nothing found</p>}
        footer={<span>Tip</span>}
      />
    );
  }

  it('moves through the results with the keyboard and selects', () => {
    const onSelect = vi.fn();
    renderApp(<Palette onSelect={onSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'End', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r:1' }));
    fireEvent.keyDown(input, { key: 'Home', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r:1' }));
    fireEvent.keyDown(input, { key: 'x' });
    expect(screen.getByText('Manage users')).toBeTruthy();
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('selects with the mouse and the keyboard on an option, and runs secondary actions', () => {
    const onSelect = vi.fn();
    renderApp(<Palette onSelect={onSelect} />);
    const options = screen.getAllByRole('option');
    fireEvent.mouseMove(options[1]!);
    fireEvent.click(options[1]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'roles' }));
    fireEvent.keyDown(options[0]!, { key: 'Enter' });
    fireEvent.keyDown(options[0]!, { key: ' ' });
    fireEvent.keyDown(options[0]!, { key: 'a' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'users' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    expect(groups[0]!.items[1]!.secondary!.onSelect).toHaveBeenCalled();
  });

  it('shows the idle content, and the empty content when a query finds nothing', () => {
    const view = renderApp(<Palette initialGroups={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('Try a page name')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    view.unmount();
    renderApp(<Palette initialGroups={[]} initialQuery="zzz" onSelect={vi.fn()} />);
    expect(screen.getByText('Nothing found')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc' } });
  });
});

describe('AccountMenu', () => {
  const props = (overrides: Partial<AccountMenuProps> = {}): AccountMenuProps => ({
    name: 'Ada Lovelace',
    handle: '@ada',
    email: 'ada@example.com',
    presence: 'online',
    presenceLabel: 'Online',
    badges: <span>2-step on</span>,
    meta: [
      { icon: <Shield />, label: 'Super admin' },
      { icon: <Home />, label: 'HQ', title: 'Branch' },
    ],
    profileHref: '/profile',
    profileLabel: 'View profile',
    notice: {
      tone: 'warning',
      title: 'Turn on two-step verification',
      description: 'Protect your account',
      action: { label: 'Set up', href: '/profile?tab=security' },
    },
    sections: [
      {
        id: 'account',
        label: 'Account',
        items: [
          {
            kind: 'link',
            id: 'profile',
            label: 'My profile',
            href: '/profile',
            shortcut: 'G P',
            badge: <span>3</span>,
            description: 'Your details',
          },
          {
            kind: 'link',
            id: 'docs',
            label: 'Docs',
            href: 'https://docs.example.com',
            external: true,
          },
          {
            kind: 'action',
            id: 'lock',
            label: 'Lock screen',
            onSelect: vi.fn(),
            destructive: true,
          },
          { kind: 'action', id: 'off', label: 'Unavailable', onSelect: vi.fn(), disabled: true },
        ],
      },
      {
        id: 'prefs',
        items: [
          {
            kind: 'choice',
            id: 'theme',
            label: 'Appearance',
            icon: <Sun />,
            value: 'light',
            options: [
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark', lang: 'en' },
            ],
            onChange: vi.fn(),
          },
          { kind: 'toggle', id: 'compact', label: 'Compact', checked: false, onChange: vi.fn() },
        ],
      },
    ],
    footer: <span>Session ends at 17:00</span>,
    signOut: { label: 'Sign out', onSelect: vi.fn(), hint: 'All devices stay signed in' },
    triggerLabel: 'Account menu',
    ...overrides,
  });

  it('shows the identity, notice, sections and footer, and runs items', async () => {
    const p = props();
    renderApp(<AccountMenu {...p} />);
    const menu = await openMenu(screen.getByRole('button', { name: 'Account menu' }));
    expect(within(menu).getByText('Ada Lovelace')).toBeTruthy();
    expect(within(menu).getByText('Turn on two-step verification')).toBeTruthy();
    expect(within(menu).getByText('Session ends at 17:00')).toBeTruthy();
    expect(within(menu).getByText('G P')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Compact/ }));
    const toggle = p.sections[1]!.items[1] as unknown as { onChange: ReturnType<typeof vi.fn> };
    expect(toggle.onChange).toHaveBeenCalledWith(true);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Lock screen/ }));
    const lock = p.sections[0]!.items[2] as unknown as { onSelect: ReturnType<typeof vi.fn> };
    expect(lock.onSelect).toHaveBeenCalled();
  });

  it('signs out and supports a notice action, a custom trigger and a pending sign-out', async () => {
    const onNotice = vi.fn();
    const p = props({
      notice: {
        tone: 'info',
        title: 'New version',
        action: { label: 'Reload', onSelect: onNotice },
      },
      trigger: <button type="button">Me</button>,
      identityAlign: 'start',
      profileHref: undefined,
      meta: [],
      handle: undefined,
    });
    const view = renderApp(<AccountMenu {...p} />);
    let menu = await openMenu(screen.getByRole('button', { name: /Account menu|Me/ }));
    fireEvent.click(within(menu).getByRole('menuitem', { name: /New version/ }));
    expect(onNotice).toHaveBeenCalled();
    menu = await openMenu(screen.getByRole('button', { name: /Account menu|Me/ }));
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Sign out/ }));
    expect(p.signOut!.onSelect).toHaveBeenCalled();
    view.unmount();

    renderApp(
      <AccountMenu
        {...props({
          notice: { tone: 'danger', title: 'Locked soon' },
          signOut: { label: 'Sign out', onSelect: vi.fn(), pending: true },
        })}
      />,
    );
    menu = await openMenu(screen.getByRole('button', { name: 'Account menu' }));
    expect(within(menu).getByText('Locked soon')).toBeTruthy();
  });
});
