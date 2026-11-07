'use client';

import { ArrowRight, ArrowUpRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemPrimitive,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from './menu';
import { metaKey, type PresenceStatus, type ProfileMetaItem } from './profile-header';

/**
 * Account menu — the signed-in user's popup (header avatar, sidebar card),
 * styled like ProfileHeader and driven entirely by props so every product can
 * supply its own identity, items and actions:
 *
 *   <AccountMenu
 *     name="Abebe Kebede" handle="@abebe" email="abebe@nib.et" presence="online"
 *     badges={<Badge tone="info">2-step on</Badge>}
 *     meta={[{ icon: <Shield />, label: 'Super admin' }]}
 *     profileHref="/profile" profileLabel="View profile"
 *     notice={{ tone: 'warning', title: 'Turn on two-step verification', action: { label: 'Set up', href: '/profile?tab=security' } }}
 *     sections={[
 *       { id: 'account', label: 'Account', items: [{ kind: 'link', id: 'profile', label: 'My profile', icon: <UserRound />, href: '/profile' }] },
 *       { id: 'prefs', label: 'Preferences', items: [{ kind: 'choice', id: 'theme', label: 'Appearance', icon: <Sun />, value, options, onChange }] },
 *     ]}
 *     footer={<>Session ends at 02:33</>}
 *     signOut={{ label: 'Sign out', onSelect: logout }}
 *     triggerLabel="Account menu"
 *   />
 *
 * Item kinds: `link` (Next.js link, or a new tab with `external`), `action`,
 * `choice` (submenu with one selected option, e.g. theme or language) and
 * `toggle` (a switch that keeps the menu open). Every item may carry an icon,
 * a description, a badge and a shortcut hint. Built on Radix DropdownMenu:
 * full keyboard support, typeahead and focus return.
 */
interface ItemBase {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: ReactNode;
  /** Count, dot or pill at the end of the item. */
  badge?: ReactNode;
  /** Keyboard hint, e.g. "Ctrl K" (display only). */
  shortcut?: string;
  disabled?: boolean;
}

export type AccountMenuItem =
  | (ItemBase & { kind: 'link'; href: string; external?: boolean })
  | (ItemBase & { kind: 'action'; onSelect: () => void; destructive?: boolean })
  | (ItemBase & {
      kind: 'choice';
      value: string;
      options: Array<{ value: string; label: string; icon?: ReactNode; lang?: string }>;
      onChange: (value: string) => void;
    })
  | (ItemBase & { kind: 'toggle'; checked: boolean; onChange: (checked: boolean) => void });

export interface AccountMenuSection {
  id: string;
  label?: string;
  items: AccountMenuItem[];
}

export type AccountNoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface AccountMenuNotice {
  tone: AccountNoticeTone;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Makes the whole callout a menu item. */
  action?: { label: string; href?: string; onSelect?: () => void };
}

export interface AccountMenuProps {
  name: string;
  /** Secondary identity, e.g. "@jdoe". */
  handle?: ReactNode;
  email?: string;
  avatarSrc?: string | null;
  presence?: PresenceStatus;
  presenceLabel?: string;
  /** Inline badges after the name (status, verified…). */
  badges?: ReactNode;
  /** Chips under the identity (role, branch…). */
  meta?: ProfileMetaItem[];
  /** Makes the identity card a link to the profile. */
  profileHref?: string;
  profileLabel?: string;
  notice?: AccountMenuNotice;
  sections: AccountMenuSection[];
  /** Quiet line above sign-out (session expiry, version…). */
  footer?: ReactNode;
  signOut?: { label: string; onSelect: () => void; pending?: boolean; hint?: ReactNode };
  /** Accessible name of the trigger. */
  triggerLabel: string;
  /** Custom trigger (rendered as the Radix trigger via asChild); default: avatar button. */
  trigger?: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Identity card layout: avatar and details centred (default) or aligned to the start. */
  identityAlign?: 'center' | 'start';
  /** Classes for the popup. */
  className?: string;
}

const PRESENCE: Record<PresenceStatus, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-danger',
  offline: 'bg-subtle-foreground',
};

const NOTICE: Record<AccountNoticeTone, string> = {
  info: 'border-info/25 bg-info-soft text-info',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-danger/25 bg-danger-soft text-danger',
};

/** Avatar with an optional presence dot (also useful outside the menu). */
export function PresenceAvatar({
  name,
  src,
  size = 32,
  presence,
  presenceLabel,
  className,
}: Readonly<{
  name: string;
  src?: string | null;
  size?: number;
  presence?: PresenceStatus;
  presenceLabel?: string;
  className?: string;
}>) {
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <Avatar name={name} src={src} size={size} />
      {presence ? (
        <span
          className={cn(
            'absolute end-0 bottom-0 rounded-full ring-2 ring-surface',
            PRESENCE[presence],
          )}
          style={{ width: dot, height: dot }}
          title={presenceLabel}
          aria-hidden
        />
      ) : null}
      {presence && presenceLabel ? <span className="sr-only">{presenceLabel}</span> : null}
    </span>
  );
}

export function AccountMenu({
  name,
  handle,
  email,
  avatarSrc,
  presence,
  presenceLabel,
  badges,
  meta = [],
  profileHref,
  profileLabel,
  notice,
  sections,
  footer,
  signOut,
  triggerLabel,
  trigger,
  side = 'bottom',
  align = 'end',
  identityAlign = 'center',
  className,
}: Readonly<AccountMenuProps>) {
  const centered = identityAlign === 'center';
  const profileLink =
    profileHref && profileLabel ? (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold text-primary-text',
          centered ? 'absolute end-3 top-2' : 'mb-0.5',
        )}
      >
        {profileLabel}
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </span>
    ) : null;
  const avatar = (
    <PresenceAvatar
      name={name}
      src={avatarSrc}
      size={centered ? 48 : 44}
      presence={presence}
      presenceLabel={presenceLabel}
      className="rounded-full ring-4 ring-surface"
    />
  );
  const identity = (
    <AccountIdentity
      name={name}
      handle={handle}
      email={email}
      badges={badges}
      meta={meta}
      centered={centered}
      avatar={avatar}
      profileLink={profileLink}
    />
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild aria-label={triggerLabel}>
        {trigger ?? (
          <button
            type="button"
            className="group rounded-full p-0.5 outline-none transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-primary"
          >
            <PresenceAvatar
              name={name}
              src={avatarSrc}
              size={32}
              presence={presence}
              presenceLabel={presenceLabel}
            />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        collisionPadding={8}
        className={cn(
          'w-[22rem] max-w-[calc(100vw-1rem)] p-0',
          'max-h-[min(44rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
          className,
        )}
      >
        {profileHref ? (
          <DropdownMenuItemPrimitive
            asChild
            className="block outline-none data-[highlighted]:bg-hover/60"
          >
            <Link href={profileHref}>{identity}</Link>
          </DropdownMenuItemPrimitive>
        ) : (
          identity
        )}

        {notice ? (
          <div className="px-2 pb-1.5">
            <NoticeCallout notice={notice} />
          </div>
        ) : null}

        {sections.map((section) =>
          section.items.length ? (
            <Fragment key={section.id}>
              <DropdownMenuSeparator className="mx-0 my-0" />
              <div className="px-1.5 py-1">
                {section.label ? (
                  <DropdownMenuLabel className="px-2 pt-1 pb-0.5 text-[11px] tracking-wide text-subtle-foreground uppercase">
                    {section.label}
                  </DropdownMenuLabel>
                ) : null}
                {section.items.map((item) => (
                  <MenuEntry key={item.id} item={item} />
                ))}
              </div>
            </Fragment>
          ) : null,
        )}

        {footer || signOut ? <DropdownMenuSeparator className="mx-0 my-0" /> : null}
        {footer ? (
          <div className="flex items-center gap-2 px-4 pt-2 pb-0.5 text-[11px] text-subtle-foreground [&_svg]:size-3.5">
            {footer}
          </div>
        ) : null}
        {signOut ? (
          <div className="px-1.5 py-1">
            <DropdownMenuItem
              destructive
              disabled={signOut.pending}
              onSelect={signOut.onSelect}
              className="font-medium data-[highlighted]:bg-danger-soft"
            >
              <LogOut /> {signOut.label}
              {signOut.hint ? (
                <span className="ms-auto truncate text-xs font-normal text-subtle-foreground">
                  {signOut.hint}
                </span>
              ) : null}
            </DropdownMenuItem>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The identity card: cover strip, avatar, name and badges, handle · e-mail, meta chips. */
function AccountIdentity({
  name,
  handle,
  email,
  badges,
  meta,
  centered,
  avatar,
  profileLink,
}: Readonly<
  Pick<AccountMenuProps, 'name' | 'handle' | 'email' | 'badges'> & {
    meta: ProfileMetaItem[];
    centered: boolean;
    avatar: ReactNode;
    profileLink: ReactNode;
  }
>) {
  return (
    <div className="relative">
      <div
        className={cn('bg-gradient-to-b from-primary-softer to-surface', centered ? 'h-10' : 'h-9')}
        aria-hidden
      />
      {centered ? profileLink : null}
      <div
        className={cn(
          'px-4 pb-3',
          centered ? '-mt-6 flex flex-col items-center text-center' : '-mt-5',
        )}
      >
        {centered ? (
          avatar
        ) : (
          <div className="flex items-end justify-between gap-2">
            {avatar}
            {profileLink}
          </div>
        )}
        <div
          className={cn(
            'mt-1.5 flex max-w-full flex-wrap items-center gap-1.5',
            centered && 'justify-center',
          )}
        >
          <span className="truncate text-[15px] leading-tight font-semibold text-foreground">
            {name}
          </span>
          {badges}
        </div>
        {handle || email ? (
          <p className="mt-0.5 max-w-full truncate text-xs text-muted-foreground">
            {handle}
            {handle && email ? <span aria-hidden> · </span> : null}
            {email}
          </p>
        ) : null}
        {meta.length ? (
          <ul className={cn('mt-2 flex flex-wrap gap-1.5', centered && 'justify-center')}>
            {meta.map((m) => (
              <li
                key={metaKey(m)}
                title={m.title}
                className="inline-flex max-w-full items-center gap-1 rounded-item border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0"
              >
                {m.icon}
                {m.title ? <span className="sr-only">{m.title}: </span> : null}
                <span className="truncate">{m.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function NoticeCallout({ notice }: Readonly<{ notice: AccountMenuNotice }>) {
  // Without a description the callout is a single line: icon · title · action.
  const inline = !notice.description;
  const actionLabel = notice.action ? (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold underline-offset-2 group-data-[highlighted]:underline',
        !inline && 'mt-1',
      )}
    >
      {notice.action.label}
      <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
    </span>
  ) : null;
  const body = (
    <span
      className={cn(
        'flex w-full gap-2.5 rounded-control border px-3 py-2 text-start [&>svg]:size-4 [&>svg]:shrink-0',
        inline ? 'items-center' : 'items-start [&>svg]:mt-0.5',
        NOTICE[notice.tone],
      )}
    >
      {notice.icon}
      {inline ? (
        <>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{notice.title}</span>
          {actionLabel}
        </>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">{notice.title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-foreground/75">
            {notice.description}
          </span>
          {actionLabel}
        </span>
      )}
    </span>
  );
  const action = notice.action;
  if (!action) return <div role="note">{body}</div>;
  const itemClass =
    'group block cursor-default rounded-control outline-none data-[highlighted]:[&>span]:ring-2 data-[highlighted]:[&>span]:ring-ring';
  return action.href ? (
    <DropdownMenuItemPrimitive asChild className={itemClass}>
      <Link href={action.href}>{body}</Link>
    </DropdownMenuItemPrimitive>
  ) : (
    <DropdownMenuItemPrimitive className={itemClass} onSelect={action.onSelect}>
      {body}
    </DropdownMenuItemPrimitive>
  );
}

function ItemText({ item }: Readonly<{ item: AccountMenuItem }>) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{item.label}</span>
      {item.description ? (
        <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
      ) : null}
    </span>
  );
}

function Trailing({ item, external }: Readonly<{ item: AccountMenuItem; external?: boolean }>) {
  if (!item.badge && !item.shortcut && !external) return null;
  return (
    <span className="ms-auto flex shrink-0 items-center gap-1.5 ps-2">
      {item.badge}
      {item.shortcut ? (
        <DropdownMenuShortcut className="ps-0">{item.shortcut}</DropdownMenuShortcut>
      ) : null}
      {external ? <ArrowUpRight className="size-3.5!" aria-hidden /> : null}
    </span>
  );
}

function MenuEntry({ item }: Readonly<{ item: AccountMenuItem }>) {
  const rowClass = cn(item.description && 'items-start [&>svg]:mt-0.5');
  switch (item.kind) {
    case 'link':
      return (
        <DropdownMenuItem asChild disabled={item.disabled} className={rowClass}>
          <Link
            href={item.href}
            {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {item.icon}
            <ItemText item={item} />
            <Trailing item={item} external={item.external} />
          </Link>
        </DropdownMenuItem>
      );
    case 'action':
      return (
        <DropdownMenuItem
          disabled={item.disabled}
          destructive={item.destructive}
          onSelect={item.onSelect}
          className={rowClass}
        >
          {item.icon}
          <ItemText item={item} />
          <Trailing item={item} />
        </DropdownMenuItem>
      );
    case 'toggle':
      return (
        <DropdownMenuSwitchItem
          checked={item.checked}
          disabled={item.disabled}
          onCheckedChange={(v) => item.onChange(v === true)}
          className={rowClass}
        >
          {item.icon}
          <ItemText item={item} />
        </DropdownMenuSwitchItem>
      );
    case 'choice': {
      const current = item.options.find((o) => o.value === item.value);
      return (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={item.disabled}
            hint={current?.label}
            className={rowClass}
          >
            {item.icon}
            <ItemText item={item} />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={item.value} onValueChange={item.onChange}>
              {item.options.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} lang={o.lang}>
                  {o.icon}
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }
  }
}
