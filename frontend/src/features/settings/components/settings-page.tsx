'use client';

import {
  Building2,
  Coins,
  FileText,
  Mail,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { usePageBreadcrumbs } from '@/shared/layouts/page-breadcrumbs';
import { describeError } from '@/shared/errors/error-messages';
import { Button } from '@/shared/ui/button';
import { ErrorState, PageSkeleton } from '@/shared/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { PageHeader } from '@/shared/ui/page-header';
import { useSettings } from '../hooks/use-settings';
import { SettingsGroupForm } from './settings-group-form';

/** Icons of the built-in groups; groups added by features get the generic one. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  company: Building2,
  format: Coins,
  mail: Mail,
  documents: FileText,
  marketplace: Store,
};

/**
 * Runtime settings: one tab per group, one form per tab. The fields are drawn
 * from the definitions the backend returns, so a setting a feature defines
 * (`settings.define()`) appears here without frontend work.
 */
export function SettingsPage() {
  const t = useTranslations('settings');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending, error, refetch } = useSettings();

  const groups = data?.groups ?? [];
  const requested = sp.get('tab');
  const tab = requested && groups.includes(requested) ? requested : (groups[0] ?? '');
  const groupLabel = (group: string) => (t.has(`groups.${group}`) ? t(`groups.${group}`) : group);
  usePageBreadcrumbs(tab ? [{ label: groupLabel(tab) }] : []);

  let body: ReactNode;
  if (isPending) {
    body = <PageSkeleton />;
  } else if (error || !data) {
    body = (
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
    body = (
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace(next === groups[0] ? pathname : `${pathname}?tab=${next}`, {
            scroll: false,
          })
        }
      >
        <TabsList className="overflow-x-auto">
          {groups.map((group) => {
            const Icon = GROUP_ICONS[group] ?? SlidersHorizontal;
            return (
              <TabsTrigger key={group} value={group} className="flex items-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {groupLabel(group)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group} value={group}>
            <SettingsGroupForm
              group={group}
              definitions={data.definitions.filter((d) => d.group === group)}
              values={data.values}
            />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <>
      <PageHeader icon={<SettingsIcon />} title={t('title')} description={t('description')} />
      {body}
    </>
  );
}
