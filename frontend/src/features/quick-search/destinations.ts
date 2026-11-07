import {
  Activity,
  AlertTriangle,
  Cog,
  Fingerprint,
  Inbox,
  KeyRound,
  ListChecks,
  MonitorSmartphone,
  Send,
  SlidersHorizontal,
  Timer,
  type LucideIcon,
} from 'lucide-react';

/**
 * Deep links that are not navigation entries (tabs, filtered views). Pages in
 * the navigation are searchable automatically; add a destination here to make
 * a sub-page findable. Labels and keywords are keys in the `quickSearch`
 * namespace; access is checked in the browser AND by the page itself.
 */
export interface Destination {
  id: string;
  href: string;
  icon: LucideIcon;
  /** quickSearch.destinations.<id>.label / .keywords */
  permission?: string;
  feature?: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: 'activity', href: '/profile?tab=activity', icon: Activity },
  { id: 'security', href: '/profile?tab=security', icon: KeyRound },
  { id: 'sessions', href: '/profile?tab=sessions', icon: MonitorSmartphone },
  { id: 'preferences', href: '/profile?tab=preferences', icon: SlidersHorizontal },
  { id: 'approvalInbox', href: '/approvals?box=inbox', icon: Inbox, feature: 'approvals' },
  { id: 'approvalMine', href: '/approvals?box=mine', icon: Send, feature: 'approvals' },
  {
    id: 'auditFailures',
    href: '/audit?filter[outcome]=in:FAILURE,DENIED',
    icon: AlertTriangle,
    permission: 'audit:read',
    feature: 'auditLog',
  },
  {
    id: 'policies',
    href: '/compliance?tab=policies',
    icon: ListChecks,
    permission: 'compliance:read',
  },
  {
    id: 'integrity',
    href: '/compliance?tab=integrity',
    icon: Fingerprint,
    permission: 'compliance:read',
  },
  {
    id: 'retention',
    href: '/compliance?tab=retention',
    icon: Timer,
    permission: 'compliance:read',
  },
  { id: 'jobs', href: '/compliance?tab=jobs', icon: Cog, permission: 'compliance:read' },
];
