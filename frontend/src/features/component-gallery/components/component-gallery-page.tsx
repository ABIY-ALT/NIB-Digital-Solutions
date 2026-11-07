'use client';

import {
  Component,
  ListChecks,
  Loader,
  MousePointerClick,
  Rows3,
  Table2,
  TextCursorInput,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePageBreadcrumbs } from '@/shared/layouts/page-breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { PageHeader } from '@/shared/ui/page-header';
import { ButtonsPanel } from './buttons-panel';
import { FeedbackPanel } from './feedback-panel';
import { FieldsPanel } from './fields-panel';
import { FormsPanel } from './forms-panel';
import { SelectionPanel } from './selection-panel';
import { TablesPanel } from './tables-panel';

const TABS = [
  { id: 'buttons', icon: MousePointerClick },
  { id: 'fields', icon: TextCursorInput },
  { id: 'forms', icon: Rows3 },
  { id: 'tables', icon: Table2 },
  { id: 'selection', icon: ListChecks },
  { id: 'feedback', icon: Loader },
] as const;
type Tab = (typeof TABS)[number]['id'];

/**
 * Component gallery: every option of the shared components, live, with the
 * value to write in app.config or on the component. The option the product
 * currently uses is marked. Turn the page off with `features.componentGallery`.
 */
export function ComponentGalleryPage() {
  const t = useTranslations('componentGallery');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = sp.get('tab');
  const tab: Tab = TABS.some((x) => x.id === requested) ? (requested as Tab) : 'buttons';
  const current = TABS.find((x) => x.id === tab)!;
  usePageBreadcrumbs([{ label: t(`tabs.${tab}`), icon: <current.icon /> }]);

  return (
    <>
      <PageHeader icon={<Component />} title={t('title')} description={t('description')} />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace(next === 'buttons' ? pathname : `${pathname}?tab=${next}`, {
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
        <TabsContent value="buttons">
          <ButtonsPanel />
        </TabsContent>
        <TabsContent value="fields">
          <FieldsPanel />
        </TabsContent>
        <TabsContent value="forms">
          <FormsPanel />
        </TabsContent>
        <TabsContent value="tables">
          <TablesPanel />
        </TabsContent>
        <TabsContent value="selection">
          <SelectionPanel />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
