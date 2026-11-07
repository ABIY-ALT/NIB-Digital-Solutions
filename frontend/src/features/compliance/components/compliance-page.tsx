'use client';

import { Cog, Fingerprint, ListChecks, ShieldCheck, Timer } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { Button } from '@/shared/ui/button';
import { ErrorState, PageSkeleton } from '@/shared/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { PageHeader } from '@/shared/ui/page-header';
import { usePageBreadcrumbs } from '@/shared/layouts/page-breadcrumbs';
import { useComplianceOverview } from '../hooks/use-compliance';
import { IntegrityPanel } from './integrity-panel';
import { JobsPanel } from './jobs-panel';
import { PoliciesPanel } from './policies-panel';
import { RetentionPanel } from './retention-panel';

const TABS = [
  { id: 'policies', icon: ListChecks },
  { id: 'integrity', icon: Fingerprint },
  { id: 'retention', icon: Timer },
  { id: 'jobs', icon: Cog },
] as const;
type Tab = (typeof TABS)[number]['id'];

/**
 * Security & compliance console: effective policies, audit-trail integrity
 * (hash chain verification, anchors), data retention and background jobs.
 */
export function CompliancePage() {
  const t = useTranslations('compliance');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = sp.get('tab');
  const tab: Tab = TABS.some((x) => x.id === requested) ? (requested as Tab) : 'policies';
  const { data, isPending, error, refetch } = useComplianceOverview();
  const current = TABS.find((x) => x.id === tab)!;
  usePageBreadcrumbs([{ label: t(`tabs.${tab}`), icon: <current.icon /> }]);

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="pt-4">
        <PageSkeleton />
      </div>
    );
  } else if (error || !data) {
    content = (
      <ErrorState
        title={te('title')}
        description={describeError(error, te).message}
        correlationId={describeError(error, te).correlationId}
        referenceLabel={tc('reference')}
        action={
          <Button variant="outline" onClick={() => refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <TabsContent value="policies">
          <PoliciesPanel overview={data} />
        </TabsContent>
        <TabsContent value="integrity">
          <IntegrityPanel overview={data} />
        </TabsContent>
        <TabsContent value="retention">
          <RetentionPanel overview={data} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsPanel overview={data} />
        </TabsContent>
      </>
    );
  }

  return (
    <>
      <PageHeader icon={<ShieldCheck />} title={t('title')} description={t('description')} />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace(next === 'policies' ? pathname : `${pathname}?tab=${next}`, {
            scroll: false,
          })
        }
      >
        <TabsList className="overflow-x-auto">
          {TABS.map(({ id, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="flex items-center gap-1.5">
              <Icon className="size-4" aria-hidden />
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {content}
      </Tabs>
    </>
  );
}
