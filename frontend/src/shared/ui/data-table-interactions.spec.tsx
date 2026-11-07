// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { describeFilter, type FilterDef } from '@/shared/lib/table-filters';
import { renderApp } from '@/testing/render';
import { DataTable, type DataTableColumn } from './data-table';
import { useDataTableLabels, useTableToolLabels } from './data-table-labels';
import { DataTableFilters } from './data-table-filters';

interface Row {
  id: string;
  name: string;
  locked: boolean;
}

const rows: Row[] = [
  { id: 'a', name: 'Abebe', locked: false },
  { id: 'b', name: 'Selam', locked: true },
  { id: 'c', name: 'Tana', locked: false },
];

const columns: DataTableColumn<Row>[] = [{ id: 'name', header: 'Name', cell: (r) => r.name }];

function SelectableTable({ onRowClick }: Readonly<{ onRowClick?: (r: Row) => void }>) {
  const labels = useDataTableLabels();
  const [selected, setSelected] = useState<string[]>(['z']);
  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        labels={labels}
        onRowClick={onRowClick}
        rowActions={(r) => <button type="button">Act on {r.name}</button>}
        selection={{
          selectedIds: selected,
          onChange: setSelected,
          isSelectable: (r) => !r.locked,
          bulkActions: <button type="button">Bulk</button>,
        }}
        expansion={{
          render: (r) => <p>Detail of {r.name}</p>,
          canExpand: (r) => r.id !== 'c',
          mode: 'multiple',
          expandAll: true,
        }}
      />
      <output data-testid="selected">{selected.join(',')}</output>
    </>
  );
}

const selected = () => screen.getByTestId('selected').textContent;

describe('DataTable selection and expansion', () => {
  it('selects rows, the page and clears, keeping selections from other pages', () => {
    const onRowClick = vi.fn();
    renderApp(<SelectableTable onRowClick={onRowClick} />);
    const boxes = screen.getAllByRole('checkbox');
    // Header + two selectable rows (the locked one cannot be picked).
    const [all, ...rowBoxes] = boxes;
    fireEvent.click(rowBoxes[0]!);
    expect(selected()).toBe('z,a');
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(rowBoxes[0]!);
    expect(selected()).toBe('z');

    fireEvent.click(all!);
    expect(selected()).toBe('z,a,c');
    expect(screen.getByRole('button', { name: 'Bulk' })).toBeTruthy();
    fireEvent.click(all!);
    expect(selected()).toBe('z');

    fireEvent.click(all!);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(selected()).toBe('');

    // Row action clicks do not open the row.
    fireEvent.click(screen.getByRole('button', { name: 'Act on Abebe' }));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Selam'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('expands rows one by one and all at once', () => {
    renderApp(<SelectableTable />);
    const expanders = screen.getAllByRole('button', { name: /show details|expand/i });
    fireEvent.click(expanders.at(-1)!);
    expect(screen.getByText('Detail of Selam')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /hide details|collapse/i }).at(-1)!);
    expect(screen.queryByText('Detail of Selam')).toBeNull();
    fireEvent.click(expanders[0]!);
    expect(screen.getAllByText(/Detail of/).length).toBeGreaterThan(0);
  });
});

const filters: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'multiselect',
    options: ['ACTIVE', 'LOCKED', 'DISABLED', 'PENDING', 'ARCHIVED', 'DELETED', 'OTHER'].map(
      (v) => ({
        value: v,
        label: v.toLowerCase(),
      }),
    ),
  },
  {
    id: 'kind',
    label: 'Kind',
    type: 'select',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  },
  { id: 'mfa', label: 'MFA', type: 'boolean', trueLabel: 'On' },
  { id: 'branch', label: 'Branch', type: 'text', placeholder: 'HQ' },
  { id: 'created', label: 'Created', type: 'dateRange' },
];

function FilterBar({
  initial = {},
  onReset,
}: Readonly<{ initial?: Record<string, string | undefined>; onReset?: () => void }>) {
  const tools = useTableToolLabels();
  const [values, setValues] = useState(initial);
  return (
    <>
      <DataTableFilters
        filters={filters}
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        labels={tools.filters}
        onReset={onReset}
      />
      <output data-testid="filters">{JSON.stringify(values)}</output>
    </>
  );
}

const values = () =>
  JSON.parse(screen.getByTestId('filters').textContent!) as Record<string, string>;
const openFilter = async (label: string) => {
  // Let a closing popover finish first: it returns focus to its trigger, which would close the next one.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  return screen.findByRole('dialog');
};

describe('DataTableFilters', () => {
  it('builds each kind of filter', async () => {
    renderApp(<FilterBar />);

    let panel = await openFilter('Status');
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'lock' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'locked' }));
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: '' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'active' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'active' }));
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'zzz' } });
    expect(within(panel).getByText('No matches')).toBeTruthy();
    expect(values().status).toBe('LOCKED');
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    panel = await openFilter('Kind');
    fireEvent.click(within(panel).getByRole('button', { name: 'Beta' }));
    expect(values().kind).toBe('b');

    panel = await openFilter('MFA');
    fireEvent.click(within(panel).getByRole('button', { name: 'On' }));
    expect(values().mfa).toBe('true');
    panel = await openFilter('MFA');
    fireEvent.click(within(panel).getByRole('button', { name: 'On' }));
    expect(values().mfa).toBeUndefined();

    panel = await openFilter('Branch');
    fireEvent.change(within(panel).getByPlaceholderText('HQ'), { target: { value: ' addis ' } });
    fireEvent.submit(within(panel).getByPlaceholderText('HQ').closest('form')!);
    expect(values().branch).toBe('contains:addis');

    panel = await openFilter('Created');
    const [from, to] = Array.from(
      panel.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];
    fireEvent.change(from!, { target: { value: '2026-02-01' } });
    fireEvent.change(to!, { target: { value: '2026-01-01' } });
    expect(
      (within(panel).getByRole('button', { name: /apply/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(to!, { target: { value: '2026-03-01' } });
    fireEvent.click(within(panel).getByRole('button', { name: /apply/i }));
    expect(values().created).toMatch(/^between:.+,.+/);

    panel = await openFilter('Created');
    fireEvent.click(within(panel).getAllByRole('button')[0]!);
    expect(values().created).toMatch(/^between:/);
  });

  it('shows active filters as chips that can be cleared or reset', async () => {
    const onReset = vi.fn();
    const view = renderApp(
      <FilterBar
        initial={{
          status: 'in:ACTIVE,LOCKED',
          kind: 'a',
          mfa: 'false',
          branch: 'contains:HQ',
          created: 'between:2026-01-01,2026-01-31',
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Status.*active, locked/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kind.*Alpha/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Branch.*HQ/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /remove.*Kind|Kind.*remove/i }));
    expect(values().kind).toBeUndefined();

    const panel = await openFilter('Branch');
    fireEvent.click(within(panel).getByRole('button', { name: /clear/i }));
    expect(values().branch).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(values()).toEqual({});
    view.unmount();

    renderApp(<FilterBar initial={{ mfa: 'true' }} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe('describeFilter', () => {
  const labels = { yes: 'Yes', no: 'No' } as never;
  it('summarises values, falling back to the raw value', () => {
    const select = filters[1]!;
    expect(describeFilter(select, 'zz', 'en', labels)).toBe('zz');
    expect(describeFilter(filters[3]!, 'HQ', 'en', labels)).toBe('“HQ”');
    expect(describeFilter(filters[2]!, false, 'en', labels)).toBe('No');
    expect(describeFilter(filters[4]!, { from: '2026-01-01' }, 'en', labels)).toBeTruthy();
    expect(describeFilter(filters[0]!, ['ACTIVE', 'UNKNOWN'], 'en', labels)).toContain('UNKNOWN');
  });
});
