'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import {
  BulletChart,
  compactNumber,
  SemiGauge,
  Sparkline,
  StackedBar,
  WaterfallChart,
} from '@/shared/ui/charts';
import { createAdvancedDemoData } from '../../demo/mock-data';
import { Panel } from './panel';

/** Comfortable, above the regulatory minimum, or below it. */
function liquidityTone(liquidity: { ratio: number; comfort: number; minimum: number }): BadgeTone {
  if (liquidity.ratio >= liquidity.comfort) return 'success';
  return liquidity.ratio >= liquidity.minimum ? 'warning' : 'danger';
}

/** Treasury tab: cash position waterfall, liquidity dial, FX board, deposit mix, branch targets. */
export function TreasuryPanel() {
  const t = useTranslations('dashboard.insights.treasury');
  const locale = useLocale();
  const demo = useMemo(() => createAdvancedDemoData(), []);
  const money = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ETB',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  const compact = (v: number) => compactNumber(v, locale);
  const currencyName = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'currency' });
    return (code: string) => names.of(code) ?? code;
  }, [locale]);
  const rate = (v: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v);
  const { liquidity } = demo;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title={t('cash.title')}
          description={t('cash.description')}
        >
          <WaterfallChart
            title={t('cash.title')}
            steps={demo.cash.map((c) => ({
              label: t(`cash.${c.key}`),
              value: c.value,
              total: c.total,
            }))}
            formatValue={money}
            formatAxis={compact}
            labels={{
              total: t('cash.balance'),
              increase: t('cash.increase'),
              decrease: t('cash.decrease'),
            }}
          />
        </Panel>
        <Panel
          title={t('liquidity.title')}
          description={t('liquidity.description')}
          action={
            <Badge tone={liquidityTone(liquidity)} dot>
              {liquidity.ratio >= liquidity.comfort ? t('liquidity.healthy') : t('liquidity.watch')}
            </Badge>
          }
        >
          <div className="flex flex-col items-center gap-4 pt-2">
            <SemiGauge
              value={liquidity.ratio}
              min={0}
              max={50}
              bands={[
                { to: liquidity.minimum, tone: 'danger' },
                { to: liquidity.comfort, tone: 'warning' },
                { to: 50, tone: 'success' },
              ]}
              formatValue={(v) => `${v}%`}
              sublabel={t('liquidity.ratio')}
            />
            <dl className="grid w-full grid-cols-2 gap-3 text-center">
              <div className="rounded-item bg-surface-muted p-2">
                <dt className="text-[11px] text-muted-foreground">{t('liquidity.minimum')}</dt>
                <dd className="text-sm font-semibold tabular">{liquidity.minimum}%</dd>
              </div>
              <div className="rounded-item bg-surface-muted p-2">
                <dt className="text-[11px] text-muted-foreground">{t('liquidity.headroom')}</dt>
                <dd className="text-sm font-semibold text-success tabular">
                  +{(liquidity.ratio - liquidity.minimum).toFixed(1)} pp
                </dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={t('fx.title')} description={t('fx.description')}>
          <div className="scrollbar-thin -mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">{t('fx.title')}</caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="px-1 pb-2 text-start font-semibold">
                    {t('fx.currency')}
                  </th>
                  <th scope="col" className="px-1 pb-2 text-end font-semibold">
                    {t('fx.buy')}
                  </th>
                  <th scope="col" className="px-1 pb-2 text-end font-semibold">
                    {t('fx.sell')}
                  </th>
                  <th scope="col" className="px-1 pb-2 text-end font-semibold">
                    {t('fx.change')}
                  </th>
                  <th scope="col" className="px-1 pb-2 text-end font-semibold">
                    {t('fx.trend')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {demo.fx.map((r) => {
                  const up = r.change >= 0;
                  return (
                    <tr key={r.code} className="transition-colors hover:bg-hover">
                      <th scope="row" className="px-1 py-2 text-start font-normal">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-6 w-9 items-center justify-center rounded-item bg-secondary-soft text-[10px] font-bold text-secondary">
                            {r.code}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {currencyName(r.code)}
                          </span>
                        </span>
                      </th>
                      <td className="px-1 py-2 text-end tabular">{rate(r.buy)}</td>
                      <td className="px-1 py-2 text-end font-semibold tabular">{rate(r.sell)}</td>
                      <td
                        className={cn(
                          'px-1 py-2 text-end text-xs font-semibold tabular',
                          up ? 'text-success' : 'text-danger',
                        )}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {up ? (
                            <ArrowUpRight className="size-3" aria-hidden />
                          ) : (
                            <ArrowDownRight className="size-3" aria-hidden />
                          )}
                          {Math.abs(r.change * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-1 py-2">
                        <span className="flex justify-end">
                          <Sparkline
                            values={r.trend}
                            width={80}
                            height={22}
                            color={up ? 'var(--success)' : 'var(--danger)'}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={t('mix.title')} description={t('mix.description')}>
          <StackedBar
            segments={demo.depositMix.map((d) => ({ label: t(`mix.${d.key}`), value: d.value }))}
            formatValue={(v) => `${v}%`}
            height={18}
          />
        </Panel>
      </div>

      <Panel title={t('targets.title')} description={t('targets.description')}>
        <BulletChart
          className="grid gap-x-8 gap-y-4 space-y-0 md:grid-cols-2"
          items={demo.targets.map((b) => ({
            id: b.code,
            label: `${b.name} · ${b.code}`,
            actual: b.actual,
            target: b.target,
          }))}
          formatValue={money}
          labels={{ target: t('targets.target'), ofTarget: t('targets.ofTarget') }}
        />
      </Panel>
    </div>
  );
}
