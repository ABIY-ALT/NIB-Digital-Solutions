// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, page, renderApp } from '@/testing/render';
import { RecordPicker, type PickerOption, type RecordPickerProps } from './record-picker';

const fruit: PickerOption[] = [
  { value: 'apple', label: 'Apple', hint: 'APL', group: 'Pome', description: 'Crunchy' },
  { value: 'pear', label: 'Pear', hint: 'Pear', group: 'Pome' },
  { value: 'cherry', label: 'Cherry', hint: 'CHR', group: 'Stone', disabled: true },
  { value: 'plum', label: 'Plum', group: 'Stone' },
  { value: 'kiwi', label: 'Kiwi' },
];

type HarnessProps = Partial<RecordPickerProps> & { initial?: string | string[] | null };

function Harness({ initial = null, ...props }: HarnessProps) {
  const [value, setValue] = useState<string | string[] | null>(initial);
  const onChange = vi.fn((next: string | string[] | null) => setValue(next));
  return (
    <>
      <RecordPicker
        aria-label="Fruit"
        {...(props as RecordPickerProps)}
        source={props.source ?? fruit}
        value={value as never}
        onChange={onChange as never}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const valueOf = () => JSON.parse(screen.getByTestId('value').textContent!) as unknown;
const combobox = () => screen.getByRole('combobox', { name: 'Fruit' });
const openPicker = async () => {
  fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
  return screen.findByRole('listbox');
};
const searchBox = () => screen.getByRole('combobox', { name: /search/i });

describe('RecordPicker (single, static source)', () => {
  it('picks with the mouse and the keyboard, and clears', async () => {
    renderApp(<Harness clearable />);
    expect(combobox().textContent).toContain('Select…');

    const list = await openPicker();
    // Groups head their options; hints repeating the label are hidden.
    expect(within(list).getByText('Pome')).toBeTruthy();
    expect(within(list).getByText('Crunchy')).toBeTruthy();
    fireEvent.click(within(list).getByRole('option', { name: /Pear/ }));
    expect(valueOf()).toBe('pear');
    expect(combobox().textContent).toContain('Pear');

    await openPicker();
    const search = searchBox();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'PageDown' });
    fireEvent.keyDown(search, { key: 'PageUp' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(valueOf()).toBe('apple');

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(valueOf()).toBeNull();
  });

  it('searches with highlighting and says when nothing matches', async () => {
    renderApp(<Harness />);
    const list = await openPicker();
    fireEvent.change(searchBox(), { target: { value: 'plu' } });
    await waitFor(() => expect(within(list).queryByText('Apple')).toBeNull());
    expect(list.querySelector('mark')).toBeTruthy();
    fireEvent.change(searchBox(), { target: { value: 'zzz' } });
    expect(await within(list).findByText(/No matches/)).toBeTruthy();
    // Enter on an empty list does nothing.
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
    expect(valueOf()).toBeNull();
  });

  it('skips disabled and excluded options, and supports a custom row and no search', async () => {
    renderApp(
      <Harness
        exclude={['kiwi']}
        isOptionDisabled={(o) => o.value === 'plum'}
        searchable={false}
        showHint={false}
        showDescription={false}
        renderOption={(o, { selected }) => <span>{`${o.label}${selected ? ' ✓' : ''}`}</span>}
        placeholder="Pick a fruit"
      />,
    );
    expect(combobox().textContent).toContain('Pick a fruit');
    const list = await openPicker();
    expect(within(list).queryByText('Kiwi')).toBeNull();
    fireEvent.click(within(list).getByText('Cherry'));
    fireEvent.click(within(list).getByText('Plum'));
    expect(valueOf()).toBeNull();
    // Keyboard on the panel when there is no search box.
    const panel = list.closest('[role="dialog"]') ?? list.parentElement!;
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    fireEvent.keyDown(panel, { key: 'Enter' });
    expect(valueOf()).toBe('pear');
  });

  it('does not open when disabled, and shows the saved value', () => {
    renderApp(<Harness initial="kiwi" disabled />);
    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox().textContent).toContain('Kiwi');
  });

  it('reveals more of a long static list on scroll', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    renderApp(<Harness source={many} pageSize={10} />);
    const list = await openPicker();
    fireEvent.click(await within(list).findByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(within(list).getAllByRole('option').length).toBeGreaterThan(10));
    fireEvent.keyDown(searchBox(), { key: 'PageDown' });
    fireEvent.keyDown(searchBox(), { key: 'PageDown' });
  });
});

describe('RecordPicker (multiple)', () => {
  it('toggles, removes chips, collapses overflow and shows the selected view', async () => {
    renderApp(<Harness multiple initial={['apple', 'pear', 'plum']} maxChips={2} />);
    expect(screen.getByRole('button', { name: 'Remove Apple' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    const list = await screen.findByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /^All$/ }));
    fireEvent.click(within(list).getByRole('option', { name: /Kiwi/ }));
    expect(valueOf()).toEqual(['apple', 'pear', 'plum', 'kiwi']);
    fireEvent.click(within(list).getByRole('option', { name: /Apple/ }));
    expect(valueOf()).toEqual(['pear', 'plum', 'kiwi']);

    // Backspace in an empty search removes the last value.
    fireEvent.keyDown(searchBox(), { key: 'Backspace' });
    expect(valueOf()).toEqual(['pear', 'plum']);

    // Typing leaves the "selected" view.
    fireEvent.click(screen.getByRole('button', { name: /^Selected/ }));
    fireEvent.change(searchBox(), { target: { value: 'k' } });
    expect(screen.getByRole('button', { name: /^All$/ }).getAttribute('aria-pressed')).toBe('true');

    // The modal panel hides the field from assistive tech while it is open.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pear', hidden: true }));
    expect(valueOf()).toEqual(['plum']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection', hidden: true }));
    expect(valueOf()).toEqual([]);
  });

  it('selects every shown option up to the maximum', async () => {
    renderApp(<Harness multiple initial={[]} maxSelected={2} />);
    const list = await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Select shown' }));
    expect(valueOf()).toEqual(['apple', 'pear']);
    expect(await screen.findByText('You can choose up to 2.')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    // At the maximum, unselected options cannot be added, selected ones can be removed.
    fireEvent.click(within(list).getByRole('option', { name: /Kiwi/ }));
    expect(valueOf()).toEqual(['apple', 'pear']);
    fireEvent.click(within(list).getByRole('option', { name: /Pear/ }));
    expect(valueOf()).toEqual(['apple']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(valueOf()).toEqual([]);
    fireEvent.keyDown(searchBox(), { key: 'Escape' });
  });

  it('shows "Add…" once something is chosen, and chips cannot be removed when disabled', () => {
    renderApp(<Harness multiple initial={['apple']} disabled />);
    expect(combobox().textContent).toContain('Add…');
    expect(screen.queryByRole('button', { name: 'Remove Apple' })).toBeNull();
  });
});

describe('RecordPicker (server source)', () => {
  const roles = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => ({
      value: `r${from + i}`,
      label: `Role ${from + i}`,
      hint: null,
      description: null,
      group: null,
      disabled: false,
    }));

  it('resolves saved values, pages through results and searches on the server', async () => {
    const api = mockApi({
      'GET /api/options/roles': ({ url }: { url: URL }) => {
        if (url.searchParams.get('values')) return page([{ value: 'r1', label: 'Role one' }]);
        const p = Number(url.searchParams.get('page') ?? 1);
        if (url.searchParams.get('search')) return page(roles(1, 50), { total: 1 });
        return page(roles(5, (p - 1) * 5), { page: p, pageSize: 5, total: 12 });
      },
    });
    renderApp(<Harness source="roles" initial="r1" pageSize={5} debounceMs={0} />);
    await waitFor(() => expect(combobox().textContent).toContain('Role one'));

    const list = await openPicker();
    await waitFor(() =>
      expect(within(list).getAllByRole('option').length).toBeGreaterThanOrEqual(10),
    );
    expect(screen.getByText(/of 12/)).toBeTruthy();

    fireEvent.change(searchBox(), { target: { value: 'fifty' } });
    await waitFor(() => expect(within(list).getByText('Role 50')).toBeTruthy());
    expect(api.calls.some((c) => c.query.get('search') === 'fifty')).toBe(true);
  });

  it('offers a retry when the options fail to load', async () => {
    let fail = true;
    mockApi({
      'GET /api/options/roles': () => (fail ? new ApiFailure(400, 'BAD_REQUEST') : page(roles(2))),
    });
    renderApp(<Harness source="roles" />);
    await openPicker();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByRole('option', { name: /Role 1/ })).toBeTruthy();
  });

  it('shows a loading state, then the empty state', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    mockApi({ 'GET /api/options/roles': async () => (await gate, page([])) });
    renderApp(<Harness source="roles" />);
    await openPicker();
    expect(await screen.findByLabelText('Loading options…')).toBeTruthy();
    release();
    expect(await screen.findByText('Nothing to choose from')).toBeTruthy();
  });
});
