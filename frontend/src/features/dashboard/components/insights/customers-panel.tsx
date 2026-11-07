'use client';

import { HeartHandshake, Smartphone, UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { FunnelChart, RadarChart } from '@/shared/ui/charts';
import { KpiCard } from '@/shared/ui/widgets';
import { createAdvancedDemoData } from '../../demo/mock-data';
import { Panel } from './panel';

/** Customers tab: onboarding funnel, portfolio radar vs last quarter, customer KPIs. */
export function CustomersPanel() {
  const t = useTranslations('dashboard.insights.customers');
  const locale = useLocale();
  const demo = useMemo(() => createAdvancedDemoData(), []);
  const count = (v: number) => new Intl.NumberFormat(locale).format(v);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('kpi.new')}
          value={count(4_870)}
          icon={<UserPlus />}
          tone="primary"
          delta={0.086}
          deltaLabel={t('kpi.vsLastMonth')}
          trend={[31, 33, 30, 36, 38, 41, 40, 44, 47, 49]}
        />
        <KpiCard
          label={t('kpi.digital')}
          value="72.4%"
          icon={<Smartphone />}
          tone="info"
          delta={0.041}
          deltaLabel={t('kpi.vsLastMonth')}
          trend={[61, 63, 64, 66, 65, 68, 69, 70, 71, 72]}
        />
        <KpiCard
          label={t('kpi.nps')}
          value="+46"
          icon={<HeartHandshake />}
          tone="success"
          delta={0.07}
          deltaLabel={t('kpi.vsLastMonth')}
          trend={[38, 39, 41, 40, 42, 43, 44, 43, 45, 46]}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title={t('funnel.title')} description={t('funnel.description')}>
          <FunnelChart
            stages={demo.funnel.map((f) => ({ label: t(`funnel.${f.key}`), value: f.value }))}
            formatValue={count}
            labels={{ conversion: t('funnel.conversion'), overall: t('funnel.overall') }}
          />
        </Panel>
        <Panel title={t('radar.title')} description={t('radar.description')}>
          <RadarChart
            title={t('radar.title')}
            axes={demo.radar.axes.map((a) => t(`radar.${a}`))}
            series={[
              { key: 'current', label: t('radar.current') },
              { key: 'previous', label: t('radar.previous'), color: 'var(--chart-4)' },
            ]}
            values={{ current: demo.radar.current, previous: demo.radar.previous }}
            formatValue={(v) => `${v}/100`}
            size={300}
          />
        </Panel>
      </div>
    </div>
  );
}
