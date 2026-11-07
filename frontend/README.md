# AppCore frontend (Next.js UI + BFF)

A single Next.js project organized by feature. Components never call APIs directly:

```
component → hook (TanStack Query) → /api/* (Next.js route) → NestJS /api/v1/*
```

Lists are also **prefetched on the server** with the same query keys, so a page streams in already filled with data. The browser hooks reuse the hydrated cache instead of fetching again.

## Structure

```
src/
├── app/                    routes only (thin): pages, layouts, error screens, /api route files
├── proxy.ts                edge of the BFF: correlation ID, CSP nonce, token refresh, idle timeout,
│                           route protection, page permissions, CSRF cookie, auth rate limit
├── features/<name>/        everything a feature needs, in one place
│   ├── resource.ts         defineResource(): query keys + BFF/backend paths + list defaults
│   ├── types.ts            types shared by the BFF and the UI
│   ├── api/                server-only: route handlers (resourceRoutes / apiRoute), loaders
│   ├── hooks/              createResourceHooks() + custom actions (client)
│   ├── components/         UI
│   └── i18n/               en.json, am.json
│   (auth/api also hosts the BFF kernel: apiRoute, session, resourceRoutes, Prefetch)
├── infrastructure/         config (app.config.ts, env, theme, navigation, feature flags), api (backend
│                           client, browser → BFF fetch), security, logging (pino), i18n (next-intl)
└── shared/                 data/ (resource, hooks factory, query client), ui/ (component library),
                            layouts/, feature-flags/, stores/ (Zustand), hooks/, errors/, lib/, types/, i18n/
```

The layer rules are enforced by ESLint (`no-restricted-imports`):

| Layer | May not import |
|---|---|
| `shared/` | `features/`, `app/`, server-only infrastructure (backend client, logging, security, env) |
| `infrastructure/` | `features/`, `app/`, `shared/ui`, `shared/layouts` |
| `features/*/components`, `features/*/hooks` | any `api/` module, server-only infrastructure |

## Adding a feature (for example, "branches")

**Fastest:** from `appcore/`, run `npm run generate -- feature branches --fields "code:string:required:unique,name:string:required"`. It creates everything below (and the backend module), wires navigation, messages and permissions, and regenerates the contract. The steps below explain what it generates.

1. **Declare the resource** in `features/branches/resource.ts`:
   ```ts
   export const branchesResource = defineResource<Branch>({
     name: 'branches', apiPath: '/api/branches', backendPath: '/branches',
     listDefaults: { pageSize: 20, sort: [{ field: 'name', direction: 'asc' }] },
   });
   ```
2. **Add BFF routes** in `api/branches.routes.ts`. `resourceRoutes` validates bodies, bounds list queries, forwards idempotency keys and returns the standard envelope:
   ```ts
   export const { list, get, create, update, remove } = resourceRoutes(branchesResource, {
     access: { read: 'branches:read', create: 'branches:create', update: 'branches:update', delete: 'branches:delete' },
     schemas: { create: createBody, update: updateBody },
   });
   ```
   Then wire them up with thin route files: `app/api/branches/route.ts` contains `export { list as GET, create as POST } from …`.
3. **Add hooks** in `hooks/use-branches.ts`:
   ```ts
   const branches = createResourceHooks<Branch, BranchInput, BranchInput>(branchesResource);
   export const useBranches = branches.useList;
   export const useSaveBranch = branches.useSave;
   export const useCloseBranch = branches.action((id: string) => ({ path: [id, 'close'] }));
   ```
4. **Build the page** in `app/(app)/branches/page.tsx` (a server component):
   ```tsx
   await requireUser({ permission: 'branches:read' });
   const params = parseListParams(toSearchParams(await searchParams), branchesResource.listDefaults);
   return <Prefetch queries={[listQuery(branchesResource, params)]}><BranchesPage /></Prefetch>;
   ```
   In the component, `useListParams(branchesResource.listDefaults)` keeps the table state in the URL.
5. **Add the form** in `components/branch-form-dialog.tsx`: `<FormSurface id="branches" …>` around the form, with `<FormGrid columns={2}>` for the fields and `<FormActions>` for the buttons. The page drives it with `const editor = useEditor<Branch>()`. The generator produces exactly this.
6. **Register** the nav item in `app.config.ts` (with `permissions` and optional `feature`) and the messages in `infrastructure/i18n/messages.ts`.

## Building blocks

| Need | Use |
|---|---|
| Data table (IB style) | `DataTable`: sorting, search, filters, pagination, `rowActions` (⋮ menu), `selection` (bulk bar), `tableId` (Columns menu, persisted), virtualization |
| Row actions | `RowActionsMenu` with `{ label, icon, description, danger, disabled, hidden, divider }` |
| Toolbar search | `<TableSearch value={params.search ?? ''} onChange={(search) => update({ search })} placeholder label />`. In `submit` mode (the default, `ui.search.mode`) the query reaches the backend only when the user clicks the search button or presses Enter. The button is highlighted while the typed text differs from the applied query; Escape restores the applied query and ✕ clears it. `live` mode searches while typing. Any list can override with `mode`, `submitOnEnter`, `minLength` and `delayMs` |
| Filters | `<DataTableFilters filters={defs} values={params.filters} onChange={(f) => update({ filters: f })} />`. Declare `select`, `multiselect`, `boolean`, `text` or `dateRange` filters; they are encoded to the backend syntax (`in:`, `contains:`, `between:`), kept in the URL and prefetched on the server |
| Export | Server: `resourceExportRoute(resource, { access, columns, fileName })` streams CSV or builds XLSX (bold frozen header, Excel filters). It pages the backend with the current filters, is capped at 10,000 rows, rate-limited and logged. Client: `<DataTableExport endpoint={hooks.exportPath} params tableId columnIds selectedIds />` exports all matching rows or only the selected rows, with visible columns only |
| Import | Server: `resourceImportRoute(resource, { access, rowSchema, toBody })` validates each row and creates it with an idempotency key (`batchId:index`), returning per-row results. Client: `<ImportDialog columns schema onImport={hooks.useImport().mutateAsync} />` has three steps: template, upload and review, then results with an error report |
| Forms | `Form` + `TextField`, `TextareaField`, `NumberField`, `SelectField`, `CheckboxField`, `SwitchField`, `RadioGroupField`, `OtpField`, `SubmitButton`, `FormRootError`, `FormActions`. Server errors map to fields automatically. Lay fields out with `<FormGrid columns={1–4}>`: columns follow the container width (container queries), so the same form reflows in any dialog, drawer or page; use `className="col-span-full"` for a full-width field. Dialog widths: `<DialogContent size="sm" | "md" | "lg" | "xl" | "2xl" | "full">` (448px → nearly full screen) |
| Toasts without boilerplate | `useX({ meta: { notify: { success: t('…'), error: true }, invalidates: [keys.all] } })` |
| Permissions | `usePermissions().can(…)`, `<Can permission="…">`, `<PermissionGuard>`, `requireUser({ permission })` |
| Feature flags | `requireFeature('x')` on the server, `useFeatureFlag('x')` or `<Feature flag="x">` on the client |
| Breadcrumbs | Automatic from navigation. Pages can append, replace or hide them with `usePageBreadcrumbs()` or `<PageBreadcrumbs>`. Configure them under `breadcrumbs` in `app.config.ts` |
| Errors | Error pages, `ErrorBoundary` and uncaught errors all report to `/api/client-errors` and appear in the pino logs with a correlation ID |
| CSV export | `toCsv` / `downloadCsv`, which neutralize spreadsheet formulas (OWASP CSV injection) |
| Relative times | `RelativeTime`, which is safe to render on the server and refreshes itself |
| Charts (`@/shared/ui/charts`) | `TrendChart` (area/line, smooth, crosshair tooltip), `BarChart` (grouped/stacked), `DonutChart`, `WaterfallChart` (opening → changes → closing), `RadarChart` (multi-series spider), `FunnelChart` (stage conversion), `BulletChart` (actual vs target), `StackedBar` (100% composition), `SemiGauge` (dial with threshold bands), `RadialProgress`, `Sparkline`, `Heatmap`. All are pure SVG/CSS (no chart library, as in IB) and theme-aware (`--chart-1…6`). They measure their own width and include a hidden data table for screen readers |
| Widgets (`@/shared/ui/widgets`) | `KpiCard`, `QuickActions` (permission-aware shortcut tiles), `Carousel` (accessible, auto-rotating, pauses on hover and for reduced motion), `TaskList` (approval queue with SLA countdown and actions), `MiniCalendar` (month grid, event dots, agenda, keyboard navigation), `SegmentedControl`, `Timeline`, `RankedList`, `StatusTracker`, `MeterList` |
| Demo | The dashboard's highlights row and the "Operations insights" tabs (Overview, Treasury, Operations, Customers) (`features/dashboard/components/dashboard-insights.tsx`) uses every chart and widget with seeded mock data from `features/dashboard/demo/mock-data.ts`. Turn it off with `features.dashboardInsights: false`; to use real data, replace `createDemoData()` with a hook per widget |
| API contract | Types come from `src/shared/api` (generated from the backend's OpenAPI): `ApiSchemas['Role']`, `ApiData<'GET /roles/{id}'>`, `API_ERROR_CODES`. Run `npm run api:generate` after backend changes; `npm run check` fails when the types are stale |
| Maker–checker | Mutations resolve to the record or an `ApprovalTicket` (202). `useSaveFeedback()(result, message)` toasts "Saved" or "Submitted for approval"; `<ApprovalNotice action="roles.update" reason onReasonChange>` collects the reason only when the policy requires approval; hooks accept `reason`; `usePendingApprovals(type, ids)` + `<PendingApprovalBadge>` mark rows; `ChangeDiff` renders before/after |
| Notifications | `NotificationBell` (header) and the notification centre at `/notifications`; messages are rendered from `notifications.templates.<template>` so they follow the reader's language |
| Form surfaces (modal or side panel) | Wrap every create / edit / view form in `<FormSurface id="users" open onOpenChange title icon size="xl">`. It opens as a centred modal or a side panel, decided by configuration, not by the feature. The order of precedence is: the `surface` prop (the form pins it), then `ui.forms.overrides[id]` in `app.config.ts`, then the user's choice in Profile › Preferences (when `ui.forms.userChoice`), then `ui.forms.surface`. Both surfaces share one header (accent bar, icon, title, `headerActions`, close), one size scale (`sm`…`2xl`, `full`, mapped to modal and panel widths) and the same body and `footer`. Children can read the result with `useFormSurface()`. Pair it with `useEditor<T>()` for page state: `editor.create()`, `editor.edit(record)`, `editor.openAs('clone', record)`, then `open={editor.open} onOpenChange={editor.onOpenChange} record={editor.record}`. `DialogContent` and `DrawerContent` remain available when a screen must always be one or the other |
| Loading | `@/shared/ui/spinner`: `<Spinner variant="ring" \| "comet" \| "dots" \| "bars" \| "pulse" size="xs"…"xl" \| px tone="brand" \| "primary" \| "current" \| "muted" speed label showLabel labelPosition decorative delay>` takes optional centred content (logo, percentage). `<LoadingOverlay active title description fullscreen>` wraps or covers a region. `<PageLoader mark title description fullscreen>` is for full-page waits. `<ProgressBar value? showValue>` is determinate or indeterminate. `useDelayedLoading(active)` means fast work never flashes a loader and a shown one never flickers. `<RouteProgress>` is the top bar during page navigation, mounted in the root layout. Defaults come from `ui.loading` in `app.config.ts`; buttons (`loading`), the record picker and the command palette use the same spinner. Loaders keep moving (slower) under reduced motion |
| Account menu | `<AccountMenu name handle email presence badges meta profileHref notice sections footer signOut triggerLabel />` (`@/shared/ui/account-menu`): the signed-in user's popup, styled like `ProfileHeader` (cover band, avatar with presence, badges, meta chips). It takes an optional callout (`notice`) and sections of `link`, `action`, `choice` (a submenu with one selected option, e.g. theme or language) and `toggle` items, each with an optional `icon`, `description`, `badge` and `shortcut`. It also takes a footer and sign-out. The identity card is centred by default (`identityAlign="start"` aligns it to the side). The trigger is an avatar by default, or pass your own `trigger`. This app fills it in `useAccountMenu()` (`features/auth/components/user-menu.tsx`), shared by the header and the sidebar card. `PresenceAvatar` is exported for reuse. Avatars are `soft` by default (a pale brand tint with brand-coloured initials); `<Avatar variant="solid">` gives the bold brand gradient. `ProfileHeader` takes `coverTone="soft" | "brand" | "none"` (soft by default) and `avatarVariant` |
| Menus | `DropdownMenu…` in `@/shared/ui/menu`: `Item` (with `destructive`), `Label`, `Separator`, `Sub` / `SubTrigger` (with a `hint` for the current value) / `SubContent`, `RadioGroup` / `RadioItem`, `SwitchItem` (stays open while toggling), `Shortcut`, and `ItemPrimitive` for custom focusable layouts |
| Record pickers | `<RecordPicker source="roles" multiple value onChange maxSelected={5} />` / `<RecordPickerField<V> name="roles" source="roles" multiple />` for any "choose a record" field (single or multiple). `source` is a backend option source (`roles`, `users`, `refdata.<list>`, or your own; served by `GET /api/options/{source}`, permission-checked and paginated on the server) or a static `PickerOption[]`. Debounced search with highlighting, infinite scroll with total counts, keyboard navigation, chips with overflow, a "Selected" view, select all shown, `clearable`, `parent`, `exclude`, `isOptionDisabled`, `renderOption`, groups and inactive options. Selected values are resolved to labels automatically. To add a source, implement `OptionSource` in the backend module that owns the records and register it in `onModuleInit` (see `role-option.source.ts`) |
| Reference data | `useLookup('branches', { parent })`, `<ReferenceSelect>` / `<ReferenceSelectField type="currencies" />` (a `RecordPicker` over `refdata.<type>`) |
| Passwords | `<PasswordField purpose="new" rules={usePasswordPolicy().data} personal={[…]}/>` (masked, never stored by the browser, live policy checklist); `<Form translateIssue={usePasswordIssueTranslator()}>` shows server rule violations translated; `SecretInput` for any secret |

## Master–detail tables

`DataTable` rows can expand to show their detail (child records, a summary) with the `expansion` prop:

```tsx
<DataTable
  …
  expansion={{
    render: (order) => <OrderLines orderId={order.id} />, // mounted only while the row is open
    canExpand: (order) => order.lineCount > 0,            // rows without detail get no chevron
  }}
/>
```

- **Lazy and cached.** The detail is mounted when its row is first expanded, so a component that calls a query hook there fetches per row, on demand, and TanStack Query caches it. Nothing is loaded for collapsed rows.
- **Building blocks** (`@/shared/ui/data-table-detail`): `DetailPanel` (title, description, actions) and `SubTable` (compact read-only child table with loading, error, empty text and a footer for totals). For child records that need their own sorting, paging or selection, render a full `DataTable` in the detail.
- **State.** The table keeps the expanded rows itself. Pass `expandedIds` and `onChange` to control it (keep it in the URL, open a row from outside); `defaultExpandedIds` opens rows at first render.
- **Product defaults.** `ui.tables.expansion` in `app.config.ts` sets `mode` (`'multiple'` or `'single'`, where opening a row closes the others), `expandAll` (header button for the whole page) and `expandOnRowClick`. A table overrides any of them in its `expansion` prop.
- **Accessibility.** The chevron is a button with `aria-expanded` and `aria-controls` pointing at the detail row; labels come from the `table` messages.
- **Limit.** Expansion is switched off when the table is virtualized (`virtualizeHeight`), because virtual rows have a fixed height.

The Roles table uses it (a role expands to its permissions: `features/roles/components/role-permissions-detail.tsx`), and the Components page has a live example with lazily loaded lines under **Tables**. To edit child records inside a form, use `LineItemsField`.

## Corner radius

Every rounded corner uses one of four theme tokens. Never hard-code `rounded-md`, `rounded-lg`, `rounded-[6px]` and so on.

| Tailwind class | Use it for | `sharp` | `slight` (default) | `rounded` | `full` |
|---|---|---|---|---|---|
| `rounded-surface` | cards, dialogs, popovers, menus, tooltips, the sign-in card | 0 | 8px | 12px | 16px |
| `rounded-control` | buttons, inputs, selects, toolbar controls | 0 | 4px | 8px | pill |
| `rounded-item` | rows inside menus and lists, inline chips, small buttons, checkboxes (capped at 4px) | 0 | 4px | 6px | 8px |
| `rounded-pill` | badges, count pills, progress bars | 0 | pill | pill | pill |

Circles such as avatars, status dots and radio buttons use `rounded-full` by design. To change the look, set `theme.radius` in `app.config.ts`. To fine-tune a single token, add for example `theme.radiusOverrides: { surface: 14, item: 5 }` (values in px).

## Customizing a product

Edit `src/infrastructure/config/app.config.ts`. It controls brand colors, radius, density, elevation, font, vertical or horizontal layout, content width (`theme.contentWidth`: `'full'` or `'contained'`), the sidebar, the top navigation of the horizontal layout (`theme.topNav`: each labelled navigation section becomes a dropdown, with optional item descriptions via `descriptionKey`; override one section with `topNav: 'dropdown' | 'inline'`, or use `grouping: 'flat'`), navigation, breadcrumbs, how forms open (`ui.forms`), feature flags and locales. The config is validated at startup.

How create / edit forms open, for every feature at once:

```ts
ui: {
  forms: {
    surface: 'drawer',            // 'dialog' (centred modal) or 'drawer' (side panel)
    drawerSide: 'end',            // 'end' = right in LTR, left in RTL; or 'start'
    overrides: { roles: 'dialog' }, // per form id (the `id` given to <FormSurface>)
    userChoice: true,             // users may pick modal / side panel in Preferences
    closeOnOutsideClick: false,   // true discards unsaved input on an outside click
    maxColumns: 2,                // most fields per row in form modals / panels (FormGrid is capped)
  },
  loading: {
    variant: 'ring',              // 'ring' | 'comet' | 'dots' | 'bars' | 'pulse'
    tone: 'brand',                // 'brand' gradient | 'primary' | 'current' | 'muted'
    delayMs: 150,                 // fast work never flashes a loader
    minDurationMs: 400,           // a shown loader never flickers
    routeProgress: true,          // top progress bar during page navigation
  },
  search: {
    mode: 'submit',               // 'submit': query on the search button / Enter · 'live': while typing
    submitOnEnter: true,
    liveDelayMs: 350,             // live mode debounce
    minLength: 0,                 // shortest query sent (clearing always searches)
  },
  controls: {
    button: 'solid',              // 'solid' | 'soft' (tinted) | 'outline' | 'elevated' (solid + shadow)
    field: 'outline',             // 'outline' (bordered box) | 'filled' (tinted box) | 'underline' (bottom line)
  },
},
```

`ui.controls` sets the look of buttons and fields for the whole product. `button` applies to the coloured variants (`primary`, `secondary`, `danger`); `outline`, `ghost`, `subtle` and `link` look the same in every product. `field` applies to `Input`, `Textarea`, `Select`, `RecordPicker`, the OTP boxes and everything built on them (`TextField`, `NumberField`, `PasswordField`, `SecretInput`, `TableSearch`). One control can pin its own look with the `appearance` prop: `<Button appearance="soft">`, `<Input appearance="filled" />`. For a custom field, use `fieldVariants({ appearance })` (the focusable element) or `fieldShellVariants({ appearance, open, disabled })` (a wrapper around it) with `useFieldAppearance()` from `@/shared/ui/input`. The **Components** page (`/components`, in the Developer section of the navigation) shows every option live and marks the one the product uses; turn it off with `features.componentGallery: false`. To add a component to it, add a `<Section>` to a panel in `features/component-gallery/components`.

## Scripts

`npm run dev` · `npm run build` · `npm run check` (typecheck, lint, format check, tests) · `npm run format`
