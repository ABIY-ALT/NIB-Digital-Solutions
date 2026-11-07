'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFormats } from '@/features/settings/hooks/use-settings';
import { lineAmount, lineTotals } from '@/shared/lib/line-items';
import { Badge } from '@/shared/ui/badge';
import { DataTable, type DataTableColumn, type DataTableExpansion } from '@/shared/ui/data-table';
import { DetailPanel, SubTable, type SubTableColumn } from '@/shared/ui/data-table-detail';
import { useDataTableLabels } from '@/shared/ui/data-table-labels';
import { useUiSettings } from '@/shared/ui/ui-settings';
import { SegmentedControl } from '@/shared/ui/widgets';
import { optionsOf, Section, Specimen, SpecimenGrid } from './specimen';

interface Order {
  id: string;
  customer: string;
  status: 'paid' | 'open' | 'draft';
  lines: number;
  total: number;
}
interface OrderLine {
  id: string;
  item: string;
  quantity: number;
  price: number;
}

const ORDERS: Order[] = [
  { id: 'ORD-1042', customer: 'Abebe Kebede Trading PLC', status: 'paid', lines: 3, total: 6583 },
  { id: 'ORD-1043', customer: 'Selam Coffee Export', status: 'open', lines: 2, total: 12400.5 },
  { id: 'ORD-1044', customer: 'Tana Logistics', status: 'draft', lines: 0, total: 0 },
  { id: 'ORD-1045', customer: 'Lalibela Hotels S.C.', status: 'open', lines: 4, total: 30210 },
];
const ITEMS = ['Card personalisation', 'On-site support', 'POS terminal rental', 'Cheque books'];
const STATUS_TONE = { paid: 'success', open: 'warning', draft: 'neutral' } as const;

type Mode = NonNullable<DataTableExpansion<Order>['mode']>;
const MODES = optionsOf<Mode>({ multiple: true, single: true });

/** Stands in for a hook such as useOrderLines(orderId): one request per expanded order, then cached. */
function useDemoLines(order: Order) {
  return useQuery({
    queryKey: ['component-gallery', 'order-lines', order.id],
    queryFn: async (): Promise<OrderLine[]> => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const seed = Number(order.id.slice(-2));
      const lines = Array.from({ length: order.lines }, (_, i) => ({
        id: `${order.id}-${i + 1}`,
        item: ITEMS[(seed + i) % ITEMS.length]!,
        quantity: ((seed + i) % 4) + 1,
        price: 250 * (((seed * (i + 3)) % 7) + 1),
      }));
      return lines;
    },
    staleTime: 5 * 60_000,
  });
}

type Money = (value: number) => string;

function lineColumns(
  t: (key: string) => string,
  money: Money,
  decimals: number,
): Array<SubTableColumn<OrderLine>> {
  return [
    { id: 'item', header: t('item'), cell: (l) => l.item },
    {
      id: 'quantity',
      header: t('quantity'),
      align: 'end',
      width: '6rem',
      cell: (l) => l.quantity,
    },
    {
      id: 'price',
      header: t('price'),
      align: 'end',
      width: '9rem',
      cell: (l) => money(l.price),
    },
    {
      id: 'amount',
      header: t('amount'),
      align: 'end',
      width: '10rem',
      cell: (l) => <span className="font-medium tabular">{money(lineAmount(l, decimals))}</span>,
    },
  ];
}

function orderColumns(t: (key: string) => string, money: Money): Array<DataTableColumn<Order>> {
  return [
    {
      id: 'order',
      header: t('order'),
      cell: (o) => <span className="font-mono text-[13px] font-semibold">{o.id}</span>,
    },
    { id: 'customer', header: t('customer'), cell: (o) => o.customer },
    {
      id: 'status',
      header: t('status'),
      cell: (o) => (
        <Badge tone={STATUS_TONE[o.status]} dot>
          {t(`statuses.${o.status}`)}
        </Badge>
      ),
    },
    {
      id: 'total',
      header: t('total'),
      align: 'end',
      cell: (o) => <span className="tabular">{money(o.total)}</span>,
    },
  ];
}

function OrderLines({ order }: Readonly<{ order: Order }>) {
  const t = useTranslations('componentGallery.sample.tables');
  const { money, format } = useFormats();
  const { data, isPending } = useDemoLines(order);
  const totals = lineTotals(data ?? [], { decimals: format.decimals });
  return (
    <DetailPanel title={t('lines', { order: order.id })} description={t('lazy')}>
      <SubTable<OrderLine>
        caption={t('lines', { order: order.id })}
        columns={lineColumns(t, money, format.decimals)}
        data={data ?? []}
        getRowId={(l) => l.id}
        loading={isPending}
        skeletonRows={Math.max(1, order.lines)}
        emptyText={t('noLines')}
        footer={
          <span className="font-semibold tabular">
            {t('total')}: {money(totals.total)}
          </span>
        }
      />
    </DetailPanel>
  );
}

/** Master–detail table: orders that expand to their lines. */
export function TablesPanel() {
  const t = useTranslations('componentGallery.sample.tables');
  const labels = useDataTableLabels();
  const { money } = useFormats();
  const defaults = useUiSettings().tables.expansion;
  const [mode, setMode] = useState<Mode>(defaults.mode);
  const [expandedIds, setExpandedIds] = useState<string[]>(['ORD-1042']);
  const columns = orderColumns(t, money);

  return (
    <div className="space-y-4">
      <Section id="expansionMode" config="ui.tables.expansion.mode" prop="expansion.mode">
        <SpecimenGrid min="16rem">
          {MODES.map((value) => (
            <Specimen key={value} name={value} isDefault={value === defaults.mode}>
              <p className="text-center text-sm text-muted-foreground">{t(`modes.${value}`)}</p>
            </Specimen>
          ))}
        </SpecimenGrid>
      </Section>

      <Section id="masterDetail" prop="expansion">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SegmentedControl
            label={t('mode')}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setExpandedIds((ids) => (next === 'single' ? ids.slice(0, 1) : ids));
            }}
            options={MODES.map((value) => ({ value, label: value }))}
          />
          <p className="text-xs text-muted-foreground">
            {t('expanded', { ids: expandedIds.join(', ') || '—' })}
          </p>
        </div>
        <DataTable
          caption={t('caption')}
          columns={columns}
          data={ORDERS}
          getRowId={(o) => o.id}
          labels={labels}
          expansion={{
            mode,
            // Controlled here to show the state; leave both out and the table keeps it.
            expandedIds,
            onChange: setExpandedIds,
            canExpand: (o) => o.status !== 'draft',
            expandOnRowClick: true,
            render: (order) => <OrderLines order={order} />,
          }}
        />
      </Section>
    </div>
  );
}
