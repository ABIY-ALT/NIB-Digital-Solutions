import type { ResolvedNavItem, ResolvedNavSection } from './navigation';

/**
 * What the horizontal top bar shows, derived from the (already filtered and
 * translated) navigation: plain links, and dropdown menus whose content is
 * split into groups (a nav item with children becomes a labelled group).
 */
export interface TopNavLink {
  kind: 'link';
  item: ResolvedNavItem;
}

export interface TopNavGroup {
  id: string;
  /** Heading inside the dropdown (a parent item's label); none for plain items. */
  label?: string;
  items: ResolvedNavItem[];
}

export interface TopNavMenu {
  kind: 'menu';
  id: string;
  label: string;
  icon?: string;
  groups: TopNavGroup[];
}

export type TopNavEntry = TopNavLink | TopNavMenu;

export interface TopNavOptions {
  grouping: 'sections' | 'flat';
  inlineSingleItem: boolean;
}

const leaves = (items: ResolvedNavItem[]): ResolvedNavItem[] =>
  items.flatMap((i) => (i.children?.length ? leaves(i.children) : [i]));

/** Consecutive plain items share a group; each parent item gets its own labelled group. */
function toGroups(sectionId: string, items: ResolvedNavItem[]): TopNavGroup[] {
  const groups: TopNavGroup[] = [];
  for (const item of items) {
    if (item.children?.length) {
      groups.push({ id: item.id, label: item.label, items: leaves(item.children) });
    } else {
      const last = groups.at(-1);
      if (last && last.label === undefined) last.items.push(item);
      else groups.push({ id: `${sectionId}:${groups.length}`, items: [item] });
    }
  }
  return groups;
}

export function buildTopNav(sections: ResolvedNavSection[], options: TopNavOptions): TopNavEntry[] {
  if (options.grouping === 'flat') {
    return sections.flatMap((s) => leaves(s.items)).map((item) => ({ kind: 'link', item }));
  }
  return sections.flatMap<TopNavEntry>((section) => {
    const display = section.topNav ?? (section.label ? 'dropdown' : 'inline');
    const pages = leaves(section.items);
    if (display === 'dropdown' && section.label) {
      if (options.inlineSingleItem && pages.length === 1)
        return [{ kind: 'link', item: pages[0]! }];
      return [
        {
          kind: 'menu',
          id: section.id,
          label: section.label,
          icon: section.icon,
          groups: toGroups(section.id, section.items),
        },
      ];
    }
    // Inline: pages in the bar; an item with children still becomes its own dropdown.
    return section.items.map<TopNavEntry>((item) =>
      item.children?.length
        ? {
            kind: 'menu',
            id: item.id,
            label: item.label,
            icon: item.icon,
            groups: [{ id: item.id, items: leaves(item.children) }],
          }
        : { kind: 'link', item },
    );
  });
}

/** All pages of a menu (for active-state checks). */
export const menuItems = (menu: TopNavMenu): ResolvedNavItem[] =>
  menu.groups.flatMap((g) => g.items);
