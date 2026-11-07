'use client';

import {
  ClipboardCheck,
  FileUp,
  Megaphone,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
  UserPlus,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApprovalSummary } from '@/features/approvals/hooks/use-approvals';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { Carousel, QuickActions } from '@/shared/ui/widgets';

/** Top row: permission-aware quick actions + announcements carousel. */
export function DashboardHighlights() {
  const t = useTranslations('dashboard.highlights');
  const { can } = usePermissions();
  const approvals = useApprovalSummary(can('approvals:approve'));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section aria-labelledby="quick-actions-title" className="lg:col-span-2">
        <h2 id="quick-actions-title" className="mb-2.5 text-sm font-semibold text-muted-foreground">
          {t('quickActions')}
        </h2>
        <QuickActions
          columns={2}
          actions={[
            {
              id: 'approvals',
              label: t('actions.approvals'),
              description: t('actions.approvalsHint'),
              icon: <ClipboardCheck />,
              href: '/approvals',
              tone: 'warning',
              badge: approvals.data?.inbox || undefined,
              hidden: !can('approvals:approve'),
            },
            {
              id: 'user',
              label: t('actions.user'),
              description: t('actions.userHint'),
              icon: <UserPlus />,
              href: '/users',
              tone: 'primary',
              hidden: !can('users:create'),
            },
            {
              id: 'import',
              label: t('actions.import'),
              description: t('actions.importHint'),
              icon: <FileUp />,
              href: '/users',
              tone: 'secondary',
              hidden: !can('users:create'),
            },
            {
              id: 'roles',
              label: t('actions.roles'),
              description: t('actions.rolesHint'),
              icon: <ShieldPlus />,
              href: '/roles',
              tone: 'info',
              hidden: !can('roles:read'),
            },
            {
              id: 'audit',
              label: t('actions.audit'),
              description: t('actions.auditHint'),
              icon: <ScrollText />,
              href: '/audit?filter[outcome]=FAILURE',
              tone: 'danger',
              hidden: !can('audit:read'),
            },
            {
              id: 'security',
              label: t('actions.security'),
              description: t('actions.securityHint'),
              icon: <ShieldCheck />,
              href: '/profile?tab=security',
              tone: 'success',
            },
          ]}
        />
      </section>
      <section aria-labelledby="announcements-title" className="flex flex-col">
        <h2 id="announcements-title" className="mb-2.5 text-sm font-semibold text-muted-foreground">
          {t('announcements')}
        </h2>
        <Carousel
          className="min-h-[196px] flex-1 shadow-card"
          labels={{
            region: t('announcements'),
            previous: t('carousel.previous'),
            next: t('carousel.next'),
            pause: t('carousel.pause'),
            play: t('carousel.play'),
            slide: (i, n) => t('carousel.slide', { index: i, total: n }),
          }}
          slides={[
            <Slide
              key="import"
              icon={<FileUp />}
              tone="from-secondary to-chart-5"
              title={t('slides.import.title')}
              text={t('slides.import.text')}
              href="/users"
              cta={t('slides.import.cta')}
            />,
            <Slide
              key="mfa"
              icon={<ShieldCheck />}
              tone="from-chart-3 to-chart-4"
              title={t('slides.mfa.title')}
              text={t('slides.mfa.text')}
              href="/profile?tab=security"
              cta={t('slides.mfa.cta')}
            />,
            <Slide
              key="maintenance"
              icon={<Wrench />}
              tone="from-chart-6 to-chart-4"
              title={t('slides.maintenance.title')}
              text={t('slides.maintenance.text')}
            />,
            <Slide
              key="news"
              icon={<Megaphone />}
              tone="from-chart-5 to-primary"
              title={t('slides.news.title')}
              text={t('slides.news.text')}
            />,
          ]}
        />
      </section>
    </div>
  );
}

function Slide({
  icon,
  tone,
  title,
  text,
  href,
  cta,
}: Readonly<{
  icon: ReactNode;
  tone: string;
  title: string;
  text: string;
  href?: string;
  cta?: string;
}>) {
  return (
    <div
      className={`relative flex h-full min-h-[196px] flex-col justify-between overflow-hidden bg-gradient-to-br ${tone} p-5 pb-12 text-white`}
    >
      <div
        className="pointer-events-none absolute -end-8 -top-10 size-36 rounded-full bg-white/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 end-16 size-28 rounded-full bg-white/10"
        aria-hidden
      />
      <div className="relative">
        <span className="mb-3 flex size-9 items-center justify-center rounded-control bg-white/15 [&_svg]:size-5">
          {icon}
        </span>
        <p className="text-base leading-snug font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/85">{text}</p>
      </div>
      {href && cta ? (
        <Link
          href={href}
          className="relative mt-3 inline-flex w-fit items-center rounded-control bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#323130] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-white"
        >
          {cta}
        </Link>
      ) : null}
    </div>
  );
}
