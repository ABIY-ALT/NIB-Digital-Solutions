// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { ComponentGalleryPage } from '@/features/component-gallery/components/component-gallery-page';
import { DashboardInsights } from '@/features/dashboard/components/dashboard-insights';
import { mockApi, renderApp, setLocation } from '@/testing/render';
import { MiniCalendar, monthGrid } from '@/shared/ui/widgets/mini-calendar';
import { formatDuration, TaskList } from '@/shared/ui/widgets/task-list';
import { Wizard } from '@/shared/ui/wizard';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

describe('MiniCalendar', () => {
  const today = new Date(2026, 9, 14);
  const events = [
    {
      id: 'e1',
      date: '2026-10-14',
      title: 'Board meeting',
      tone: 'primary' as const,
      time: '09:00',
    },
    { id: 'e2', date: '2026-10-14', title: 'Audit review', tone: 'danger' as const },
    { id: 'e3', date: '2026-10-20', title: 'Payroll' },
    { id: 'e4', date: '2026-11-02', title: 'Holiday', tone: 'success' as const },
  ];

  it('lays out whole weeks', () => {
    const grid = monthGrid(new Date(2026, 1, 1));
    expect(grid.length % 7).toBe(0);
    expect(grid[0]!.getDay()).toBe(grid[7]!.getDay());
  });

  it('shows the events of a day and moves between months', () => {
    renderApp(
      <MiniCalendar
        events={events}
        locale="en"
        today={today}
        labels={{ previous: 'Previous month', next: 'Next month', noEvents: 'Nothing planned' }}
      />,
    );
    expect(screen.getByText('Board meeting')).toBeTruthy();
    expect(screen.getByText('09:00')).toBeTruthy();
    const day = (iso: string) => document.querySelector(`[data-day="${iso}"]`) as HTMLElement;
    const focused = () => document.querySelector('[role="gridcell"][tabindex="0"]') as HTMLElement;
    fireEvent.click(day('2026-10-20'));
    expect(screen.getByText('Payroll')).toBeTruthy();
    fireEvent.click(day('2026-10-21'));
    expect(screen.getByText('Nothing planned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(day('2026-11-02'));
    expect(screen.getByText('Holiday')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(day('2026-09-15'));
    // Arrow keys move the selected day, across months too.
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'Home',
    ]) {
      fireEvent.keyDown(focused(), { key });
    }
  });
});

describe('TaskList', () => {
  it('formats durations', () => {
    expect(formatDuration(30_000)).toBeTruthy();
    expect(formatDuration(90 * 60_000)).toMatch(/h/);
    expect(formatDuration(3 * 86_400_000)).toMatch(/d/);
  });

  it('counts down to each deadline and marks overdue tasks', async () => {
    const now = Date.now();
    renderApp(
      <TaskList
        items={[
          {
            id: 't1',
            title: 'Approve loan',
            subtitle: 'Branch HQ',
            value: 'ETB 1M',
            priority: 'high',
            dueAt: new Date(now + 3_600_000),
          },
          { id: 't2', title: 'Review KYC', priority: 'medium', dueAt: new Date(now - 7_200_000) },
          {
            id: 't3',
            title: 'File report',
            priority: 'low',
            dueAt: new Date(now + 5 * 86_400_000),
          },
        ]}
        labels={{
          priority: { high: 'High', medium: 'Medium', low: 'Low' },
          dueIn: (t) => `due in ${t}`,
          overdue: (t) => `overdue ${t}`,
        }}
        renderActions={(item) => <button type="button">Open {item.id}</button>}
      />,
    );
    expect(await screen.findByText(/overdue/)).toBeTruthy();
    expect(screen.getAllByText(/due in/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open t1' })).toBeTruthy();
  });
});

describe('Wizard', () => {
  function Harness({ onComplete }: Readonly<{ onComplete: (v: unknown) => Promise<void> }>) {
    const form = useForm<{ name: string; email: string }>({
      defaultValues: { name: '', email: '' },
    });
    return (
      <Wizard
        form={form}
        onComplete={onComplete}
        labels={{
          back: 'Back',
          next: 'Next',
          finish: 'Finish',
          stepOf: (c, t) => `Step ${c} of ${t}`,
        }}
        steps={[
          {
            id: 'who',
            title: 'Who',
            description: 'Your name',
            fields: ['name'],
            content: (
              <input
                aria-label="Name"
                {...form.register('name', { required: 'Name is required' })}
              />
            ),
          },
          {
            id: 'how',
            title: 'How',
            fields: ['email'],
            content: <input aria-label="Email" {...form.register('email')} />,
          },
          { id: 'done', title: 'Review', content: <p>Check and finish</p> },
        ]}
      />
    );
  }

  it('validates each step before moving on, goes back, and finishes', async () => {
    const onComplete = vi.fn(() => Promise.resolve());
    renderApp(<Harness onComplete={onComplete} />);
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Step 2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Check and finish');
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ada' })),
    );
  });
});

describe('gallery and insights', () => {
  it('renders every tab of the component gallery', async () => {
    setLocation('/component-gallery');
    mockApi({});
    renderApp(<ComponentGalleryPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(3);
    for (const tab of tabs) {
      fireEvent.mouseDown(tab);
      fireEvent.click(tab);
      fireEvent.focus(tab);
      expect(screen.getAllByRole('tabpanel').length).toBeGreaterThan(0);
    }
    const tablesTab = tabs.find((t) => /table/i.test(t.textContent ?? ''));
    if (tablesTab) {
      fireEvent.mouseDown(tablesTab);
      fireEvent.click(tablesTab);
      const panel = screen.getAllByRole('tabpanel')[0]!;
      for (const button of within(panel).queryAllByRole('button').slice(0, 15))
        fireEvent.click(button);
    }
  });

  it('renders the dashboard insights and switches their views', async () => {
    mockApi({});
    const { container } = renderApp(<DashboardInsights />);
    await waitFor(() => expect(container.querySelectorAll('svg').length).toBeGreaterThan(10));
    for (const button of screen.getAllByRole('radio').slice(0, 12)) fireEvent.click(button);
    for (const tab of screen.queryAllByRole('tab')) {
      fireEvent.mouseDown(tab);
      fireEvent.click(tab);
    }
  });
});
