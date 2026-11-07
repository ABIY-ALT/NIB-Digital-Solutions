import { UsageError } from '../kernel/errors';

export interface PageNames {
  /** URL segment and feature folder: "loan-reports". */
  kebab: string;
  /** Translation namespace: "loanReports". */
  camel: string;
  /** Component prefix: "LoanReports". */
  pascal: string;
  /** Human title: "Loan reports". */
  title: string;
}

export function pageNames(input: string, title?: string): PageNames {
  const kebab = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(kebab)) {
    throw new UsageError(
      `The name must be kebab-case, e.g. "loan-reports" (got "${input}")`,
      'make:page',
    );
  }
  const words = kebab.split('-');
  const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
  const pascal = words.map(cap).join('');
  return {
    kebab,
    camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
    pascal,
    title: title?.trim() || cap(words.join(' ')),
  };
}

export interface PageSpec {
  names: PageNames;
  /** Permission the page requires (omit: any signed-in user). */
  permission?: string;
  /** Lucide icon name (must be in the navigation icon map when a nav entry is added). */
  icon: string;
  /** Module that exports `requireUser`, as an "@/…" specifier. */
  sessionModule: string;
}

const quote = (text: string): string => {
  const escaped = text.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`);
  return `'${escaped}'`;
};

/** The feature's page component (client): header + empty state, ready to fill in. */
export function componentFile({ names, icon }: PageSpec): string {
  return `'use client';

import { ${icon} } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/page-header';

/**
 * ${names.title} page. Components never call APIs directly: add a hook under
 * ../hooks that calls /api/${names.kebab}, and a route handler under ../api.
 */
export function ${names.pascal}Page() {
  const t = useTranslations(${quote(names.camel)});
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} icon={<${icon} />} />
      <EmptyState title={t('empty.title')} description={t('empty.description')} />
    </>
  );
}
`;
}

/** The route file: a server component that checks access, then renders the feature page. */
export function routeFile({ names, permission, sessionModule }: PageSpec): string {
  const requirement = permission ? `{ permission: ${quote(permission)} }` : '';
  return `import type { Metadata } from 'next';
import { requireUser } from ${quote(sessionModule)};
import { ${names.pascal}Page } from '@/features/${names.kebab}/components/${names.kebab}-page';

export const metadata: Metadata = { title: ${quote(names.title)} };

export default async function Page() {
  await requireUser(${requirement});
  return <${names.pascal}Page />;
}
`;
}

/** Messages of the page, under the feature's own namespace. */
export function messagesFile({ names }: PageSpec): string {
  return `${JSON.stringify(
    {
      [names.camel]: {
        nav: names.title,
        title: names.title,
        description: `Describe what ${names.title.toLowerCase()} is for.`,
        empty: {
          title: 'Nothing here yet',
          description: 'This page was scaffolded. Replace this state with real content.',
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function navigationEntry({ names, permission, icon }: PageSpec): string {
  const labelKey = `${names.camel}.nav`;
  const href = `/${names.kebab}`;
  return [
    '        {',
    `          id: ${quote(names.kebab)},`,
    `          labelKey: ${quote(labelKey)},`,
    `          href: ${quote(href)},`,
    `          icon: ${quote(icon)},`,
    ...(permission ? [`          permissions: [${quote(permission)}],`] : []),
    '        },',
    '',
  ].join('\n');
}

/**
 * Inserts `text` right before a marker comment line. Returns null when the
 * marker is missing, and the source unchanged when the text is already there
 * (so running the command twice is safe).
 */
export function insertBeforeMarker(source: string, marker: string, text: string): string | null {
  if (source.includes(text.trim())) return source;
  const index = source.indexOf(marker);
  if (index === -1) return null;
  const lineStart = source.lastIndexOf('\n', index) + 1;
  return source.slice(0, lineStart) + text + source.slice(lineStart);
}
