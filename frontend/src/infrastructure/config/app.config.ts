import { defineAppConfig } from '@/infrastructure/config/app-config.schema';

/**
 * THE configuration object for this product. Each NIB product built on AppCore
 * edits only this file (plus env secrets) to change branding, layout, density,
 * navigation, i18n and feature flags. It is validated when the app starts.
 */
export const appConfig = defineAppConfig({
  app: {
    id: 'appcore-web',
    name: 'NIB Digital Solutions',
    shortName: 'NIB Digital',
    description: 'Digital products portfolio and automation marketplace of NIB International Bank',
    logo: '/brand/nib-logo.png',
    tagline: 'NIB International Bank',
    homePath: '/dashboard',
    loginPath: '/login',
    links: {
      privacyPolicy: 'https://nibbanksc.com/privacy', // same links as NIB IB; confirm before launch
      // Self-service reset by e-mailed link. Remove to send users to the help desk instead.
      forgotPassword: '/forgot-password',
      social: [
        { network: 'facebook', url: 'https://www.facebook.com/NibInternationalBank' },
        { network: 'x', url: 'https://twitter.com/nibinterbank' },
        { network: 'linkedin', url: 'https://www.linkedin.com/company/nib-international-bank' },
        { network: 'instagram', url: 'https://www.instagram.com/nibinternationalbank' },
        { network: 'telegram', url: 'https://t.me/nibinternationalbank' },
      ],
    },
  },
  environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development',
  auth: {
    idleTimeoutMinutes: 15,
    idleWarningSeconds: 60,
    sessionMaxAgeHours: 8,
    refreshLeewaySeconds: 60,
    showSsoButton: true,
  },
  i18n: {
    locales: ['en', 'am'],
    defaultLocale: 'en',
    localeLabels: { en: 'English', am: 'አማርኛ' },
  },
  breadcrumbs: {
    enabled: true,
    placement: 'header', // or 'content' (above the page title)
    home: 'icon-label', // 'icon' | 'none'
    showSection: true, // Home › Administration › Users
    showIcons: true, // icon on every crumb (Home, section, page)
    separator: 'chevron', // 'slash' | 'dot'
    maxItems: 4,
  },
  ui: {
    forms: {
      surface: 'dialog', // 'drawer' opens every create/edit form as a side panel
      drawerSide: 'end',
      overrides: {
        // roles: 'drawer',             // per form id (see <FormSurface id="…">)
      },
      userChoice: true, // users may pick "modal" or "side panel" in Preferences
      closeOnOutsideClick: false, // protects unsaved input
      maxColumns: 2, // at most two fields per row in form modals / panels
    },
    search: {
      mode: 'submit', // 'submit': search on the button / Enter · 'live': while typing
      submitOnEnter: true,
      liveDelayMs: 350, // live mode only
      minLength: 0, // shortest query sent to the backend
    },
    loading: {
      variant: 'ring', // 'ring' | 'comet' | 'dots' | 'bars' | 'orbit' | 'pulse'
      tone: 'brand', // 'brand' (gradient) | 'primary' | 'current' | 'muted'
      delayMs: 150, // fast responses never flash a loader
      minDurationMs: 400, // a shown loader never flickers
      routeProgress: true, // top progress bar during page navigation
    },
    controls: {
      button: 'solid', // 'solid' | 'soft' | 'outline' | 'elevated'
      field: 'outline', // 'outline' | 'filled' | 'underline'
    },
    pagination: {
      pageSize: 20, // rows per page unless the list or the URL says otherwise
      pageSizeOptions: [10, 20, 50, 100], // choices in the rows-per-page select
      maxPageSize: 100, // largest page a URL may ask for (backend limit)
      showPageSize: true,
      showFirstLast: true, // jump-to-first / jump-to-last buttons
      siblings: 1, // page numbers on each side of the current page
    },
    tables: {
      // Master–detail rows (<DataTable expansion>); a table can override each of these.
      expansion: {
        mode: 'multiple', // 'single': opening a row closes the others
        expandAll: true, // header button to expand / collapse the whole page
        expandOnRowClick: false, // true: click anywhere on a row to toggle it
      },
    },
  },
  features: {
    auditLog: true,
    /** Maker–checker workspace (the backend decides which actions need approval). */
    approvals: true,
    /**
     * Dashboard "Operations insights" (chart & widget kit with generated banking
     * sample data). Off: the figures are not NIB Digital Solutions data.
     */
    dashboardInsights: false,
    /** Users may choose light, dark or system colours (header switcher, Preferences). */
    darkMode: true,
    /**
     * Components page: every option of the shared components, live (a developer
     * reference). Off for staff; developers can switch it on locally.
     */
    componentGallery: false,
    /**
     * Dashboard catalogue (/dashboards/<id>). Switch off what a product does not
     * need: the menu entry, the page and its API route all disappear (404).
     */
    'dashboards.crm': false,
    'dashboards.ecommerce': false,
    'dashboards.analytics': false,
    'dashboards.finance': false,
    'dashboards.logistics': false,
    'dashboards.support': false,
    'dashboards.academy': false,
    'dashboards.hr': false,
  },
  theme: {
    // NIB International Bank's colours: gold and the logo's brown (dark mode lightens it for contrast).
    colors: { primary: '#FEB914', secondary: '#8B4E20' },
    radius: 'slight',
    density: 'default',
    elevation: 'subtle',
    layout: 'vertical',
    sidebar: { width: 260, collapsedWidth: 56, collapsible: true, defaultCollapsed: false },
    // Horizontal layout: each labelled navigation section is a dropdown
    // (override per section with `topNav: 'dropdown' | 'inline'`).
    topNav: {
      grouping: 'sections', // or 'flat': every page as a link in the bar
      inlineSingleItem: true, // a section with one visible page shows as a plain link
      openOnHover: true, // false = open on click only
      showIcons: true,
      showDescriptions: true, // uses each item's descriptionKey
    },
    mode: 'light', // default colour mode: 'light' | 'dark' | 'system'
  },
  navigation: [
    {
      id: 'main',
      items: [
        {
          id: 'dashboard',
          labelKey: 'nav.dashboard',
          descriptionKey: 'nav.descriptions.dashboard',
          href: '/dashboard',
          icon: 'LayoutDashboard',
        },
        {
          id: 'approvals',
          labelKey: 'nav.approvals',
          descriptionKey: 'nav.descriptions.approvals',
          href: '/approvals',
          icon: 'ClipboardCheck',
          feature: 'approvals',
        },
      ],
    },
    {
      id: 'dashboards',
      labelKey: 'dashboards.nav.section',
      icon: 'LayoutGrid',
      // One entry per catalogue dashboard (features/dashboards/registry.ts); each
      // shows only when its feature flag is on. Reorder or remove freely.
      items: (
        [
          ['crm', 'Handshake'],
          ['ecommerce', 'ShoppingCart'],
          ['analytics', 'ChartLine'],
          ['finance', 'Landmark'],
          ['logistics', 'Truck'],
          ['support', 'Headset'],
          ['academy', 'GraduationCap'],
          ['hr', 'IdCard'],
        ] as const
      ).map(([id, icon]) => ({
        id: `dashboards-${id}`,
        labelKey: `dashboards.catalogue.${id}.title`,
        descriptionKey: `dashboards.catalogue.${id}.description`,
        href: `/dashboards/${id}`,
        icon,
        feature: `dashboards.${id}`,
      })),
    },
    {
      id: 'marketplace',
      labelKey: 'marketplaceAdmin.nav.section',
      icon: 'ShoppingCart',
      items: [
        {
          id: 'marketplace-analytics',
          labelKey: 'marketplaceAdmin.nav.analytics',
          href: '/marketplace-analytics',
          icon: 'ChartLine',
          permissions: ['marketplace-analytics:read'],
        },
        {
          id: 'digital-products',
          labelKey: 'digitalProducts.nav',
          href: '/digital-products',
          icon: 'ShoppingCart',
          permissions: ['digital-products:read'],
        },
        {
          id: 'hero-slides',
          labelKey: 'heroSlides.nav',
          href: '/hero-slides',
          icon: 'Images',
          permissions: ['hero-slides:read'],
        },
        {
          id: 'product-categories',
          labelKey: 'productCategories.nav',
          href: '/product-categories',
          icon: 'LayoutGrid',
          permissions: ['product-categories:read'],
        },
        {
          id: 'demo-requests',
          labelKey: 'demoRequests.nav',
          href: '/demo-requests',
          icon: 'Handshake',
          permissions: ['demo-requests:read'],
        },
        {
          id: 'product-inquiries',
          labelKey: 'productInquiries.nav',
          href: '/product-inquiries',
          icon: 'Headset',
          permissions: ['product-inquiries:read'],
        },
        {
          id: 'product-ideas',
          labelKey: 'productIdeas.nav',
          href: '/product-ideas',
          icon: 'Lightbulb',
          permissions: ['product-ideas:read'],
        },
        {
          id: 'product-developers',
          labelKey: 'productDevelopers.nav',
          href: '/product-developers',
          icon: 'Code2',
          permissions: ['product-developers:read'],
        },
        {
          id: 'product-questions',
          labelKey: 'productQuestions.nav',
          href: '/product-questions',
          icon: 'MessagesSquare',
          permissions: ['product-questions:read'],
        },
        {
          id: 'product-reviews',
          labelKey: 'productReviews.nav',
          descriptionKey: 'productReviews.navDescription',
          href: '/product-reviews',
          icon: 'Star',
          permissions: ['product-reviews:read'],
        },
      ],
    },
    {
      id: 'administration',
      labelKey: 'nav.sections.administration',
      icon: 'Building2',
      items: [
        {
          id: 'users',
          labelKey: 'nav.users',
          descriptionKey: 'nav.descriptions.users',
          href: '/users',
          icon: 'Users',
          permissions: ['users:read'],
        },
        {
          id: 'roles',
          labelKey: 'nav.roles',
          descriptionKey: 'nav.descriptions.roles',
          href: '/roles',
          icon: 'ShieldCheck',
          permissions: ['roles:read'],
        },
        {
          id: 'reference-data',
          labelKey: 'nav.referenceData',
          descriptionKey: 'nav.descriptions.referenceData',
          href: '/reference-data',
          icon: 'Database',
          permissions: ['reference-data:read'],
        },
        {
          id: 'settings',
          labelKey: 'nav.settings',
          descriptionKey: 'nav.descriptions.settings',
          href: '/settings',
          icon: 'Settings',
          permissions: ['settings:read'],
        },
        // appcore:nav (feature generator inserts new items above this line)
      ],
    },
    {
      id: 'governance',
      labelKey: 'nav.sections.governance',
      icon: 'Scale',
      items: [
        {
          id: 'audit',
          labelKey: 'nav.audit',
          descriptionKey: 'nav.descriptions.audit',
          href: '/audit',
          icon: 'ScrollText',
          permissions: ['audit:read'],
          feature: 'auditLog',
        },
        {
          id: 'compliance',
          labelKey: 'nav.compliance',
          descriptionKey: 'nav.descriptions.compliance',
          href: '/compliance',
          icon: 'ShieldCheck',
          permissions: ['compliance:read'],
        },
      ],
    },
    {
      id: 'developer',
      labelKey: 'nav.sections.developer',
      icon: 'Component',
      items: [
        {
          id: 'components',
          labelKey: 'nav.components',
          descriptionKey: 'nav.descriptions.components',
          href: '/components',
          icon: 'Component',
          feature: 'componentGallery',
        },
      ],
    },
    {
      id: 'account',
      labelKey: 'nav.sections.account',
      icon: 'UserCog',
      items: [
        {
          id: 'notifications',
          labelKey: 'nav.notifications',
          descriptionKey: 'nav.descriptions.notifications',
          href: '/notifications',
          icon: 'Bell',
        },
        {
          id: 'profile',
          labelKey: 'nav.profile',
          descriptionKey: 'nav.descriptions.profile',
          href: '/profile',
          icon: 'UserRound',
        },
      ],
    },
  ],
});
