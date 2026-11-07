# AppCore Framework — Master Development Prompt

## What to Build

Build a reusable, enterprise-grade custom framework named **AppCore**. It has two parts: a frontend built on Next.js (acting as a Backend-for-Frontend, or BFF) and a backend built on NestJS. The framework is a shared foundation for multiple NIB digital products — meaning each new application should be able to plug into AppCore and get authentication, authorization, UI, API communication, security, and all common functionality out of the box without rebuilding it.

For this first phase, focus on establishing the base architecture and implementing authentication and authorization end to end.

Always use the **latest stable version** of every package, library, and tool used across the entire framework. Do not pin to older versions unless a specific incompatibility requires it, and document the reason clearly if so.

---

## Design & Visual Identity

### Color Palette
- **Primary color**: `#FEB914` (NIB yellow/gold) — use for primary actions, active states, highlights, and key brand moments
- **Secondary color**: `#8B4E20` (NIB brown) — use for secondary actions, accents, and supporting visual elements
- Use these colors purposefully and sparingly. The majority of the UI should use neutral tones (whites, grays, and dark backgrounds where appropriate) so that the brand colors stand out where they matter.

### UI Style Reference
The UI should closely follow the look and feel of the NIB Internet Banking (IB) frontend applications. Key characteristics to replicate:
- Clean, professional, and information-dense layouts typical of enterprise banking software
- The **data table** component is a centerpiece — it should look and behave like the IB data table: clear column headers, subtle row dividers, hover states, inline actions, pagination controls, and a well-designed toolbar with search and filter options
- Consistent spacing, subtle shadows, and a structured grid feel
- Sidebar navigation with a collapsible design, active state highlighted in the primary color
- Top header bar with user profile, notifications, and breadcrumbs
- Forms that feel polished and guided, not cluttered
- Status badges, tags, and indicators that are color-coded and readable at a glance

### Configurability
The layout and visual style must be configurable at the application level so that each NIB product can adjust the look without touching the core framework. Configuration should cover:
- Border radius (sharp, slightly rounded, or fully rounded)
- Sidebar width and collapse behavior
- Primary and secondary color overrides per product
- Font family and size scale
- Spacing and density (compact, default, comfortable)
- Card and surface elevation (flat, subtle shadow, elevated)
- Whether the layout is vertical (sidebar) or horizontal (top navigation)

These settings should be defined in a central place so that changing one value cascades consistently across the entire application.

---

## Part 1 — AppCore Frontend (Next.js BFF)

### Purpose
The frontend layer serves as both the user interface and the Backend-for-Frontend. It handles everything the user sees and interacts with, while also acting as the secure middle layer between the browser and the backend API. No sensitive tokens or credentials ever reach the browser.

### Architecture
Organize the project by feature, not by technical type. Each feature (authentication, user management, dashboard, etc.) should contain everything it needs in one place. There should be a clear separation between the presentation layer (what users see), the BFF layer (server-side logic and API communication), infrastructure concerns (configuration, logging, external service adapters), and shared utilities.

### UI & Component Library
Build a reusable component library using the latest versions of shadcn/ui, Radix UI, and Tailwind CSS as the foundation. Components should follow the visual style described above and include:
- Forms and all input types
- Data tables with sorting, filtering, searching, pagination, and inline actions — styled like the IB application
- Dialogs, drawers, and modals
- Toast and alert notifications
- Multi-step wizards
- File upload areas
- Loading states and skeletons
- Empty states
- Error displays
- Page headers and breadcrumbs
- Badges, tags, and status indicators
- Avatars and user profile elements

All components must support the configurable theme described above.

### Layouts & Navigation
Provide ready-made layouts that applications can choose from:
- **Vertical layout** (sidebar + main content) — default
- **Horizontal layout** (top navigation + main content)
- **Blank layout** — for login, error, and splash pages
- **Split layout** — for two-panel experiences
- **Fullscreen layout** — for immersive screens

Navigation menus, breadcrumbs, and sidebar items should be driven by configuration, not hardcoded. Items that a user does not have permission to access should not appear at all.

### Internationalization
Support English and Amharic from the start. The architecture should also be ready for right-to-left languages in the future. Translations should be organized per feature so teams can manage their own content without conflicts.

### Forms & Validation
All forms should use the latest versions of React Hook Form combined with Zod for validation. The framework should provide reusable form components that handle validation display, submission states, and error mapping automatically. Multi-step forms should be supported through the wizard component.

### Authentication
Provide a fully built, reusable authentication module covering:
- Login, logout, and session management
- Standard OAuth2/OIDC support — designed so that any compliant identity provider can be plugged in later with minimal changes
- Secure sessions using cookies that cannot be read by JavaScript
- Automatic token refresh before expiry
- Idle timeout with a warning before the session ends
- MFA-ready architecture that can plug in TOTP or SMS verification
- Protected routes that redirect unauthenticated users automatically

The BFF layer handles all token management. The browser only receives a secure, opaque session cookie. The identity provider integration is abstracted so it can be swapped or extended without changing the rest of the authentication module.

### Authorization (Frontend)
The frontend enforces authorization as a user experience layer — hiding or disabling UI elements the user cannot access. It is not the authoritative check (that is the backend's job), but it should be seamless. Provide reusable helpers so developers can easily show or hide any component based on the user's roles or permissions, without writing repetitive logic.

### Communication Security
All communication between the browser and the BFF happens over HTTPS. The BFF communicates with the backend using its own secure service identity, not the user's raw token. Inspired by the encryption approach in the NIB IB project (which uses encrypted payloads between its BFF and .NET Core backend), the framework should support optional application-level payload encryption between the BFF and the NestJS backend — meaning the content of requests is encrypted before leaving the BFF and decrypted by the backend, adding a second layer of security beyond HTTPS alone.

CSRF protection is applied to all state-changing requests. Tokens are never stored in the browser's local storage.

### API Communication Layer
The BFF communicates with the backend through a centralized, reusable API client that handles timeouts, automatic retries, cancellation of in-flight requests, error normalization, attaching security identifiers to every request, and transforming responses into a consistent shape before the UI sees them.

### State Management
Use the latest version of TanStack Query for all data fetching, caching, and background refreshing. Use the latest version of Zustand for lightweight global client state such as UI preferences, notification queues, and open panel states. Components never call APIs directly — they go through hooks.

### Security
Implement security headers, content security policies, XSS protection, safe redirect validation, and rate limiting on authentication endpoints. Follow OWASP best practices throughout.

### Error Handling
Provide a centralized error handling system that catches all types of errors — API failures, validation errors, authentication failures, permission denials, network problems, and unexpected crashes — and maps them to appropriate user-facing messages and UI states. Each error should carry a correlation identifier so it can be traced in logs.

### Configuration & Feature Flags
All framework settings should be defined in one typed, validated configuration object per application. This includes environment, API endpoints, auth settings, feature toggles, i18n preferences, and the UI theme values described above. Feature flags control what is visible or available without code changes.

### Observability
All server-side actions are logged in a structured format. Every request carries a unique correlation identifier from the moment it enters the BFF through to the backend response. Errors are captured with enough context to diagnose problems without exposing sensitive information.

### Performance
Use server-rendered components by default for fast page loads. Apply lazy loading, code splitting, streaming, and caching strategies to keep the application responsive. Large lists should be virtualized.

### Accessibility
All components must follow WCAG 2.1 AA accessibility guidelines: keyboard navigation, screen reader support, proper focus management, ARIA attributes, and sufficient color contrast.

### Package & Monorepo Strategy
Structure the project as a monorepo so that AppCore packages (UI components, auth module, API client, configuration, utilities, types) can be shared across multiple NIB digital products without duplication. Use the latest version of Turborepo to manage the monorepo.

---

## Part 2 — AppCore Backend (NestJS)

### Purpose
The backend provides the authoritative business logic, data access, and security enforcement. It is organized following Clean Architecture principles so that business rules are completely independent of the database, framework, or any external system. Authorization checks here are final — the frontend's checks are for UX only.

### Architecture
Separate the application into four clear layers, with dependencies pointing inward:
- **Domain** — pure business rules, entities, and logic; no framework dependencies
- **Application** — use cases that orchestrate the domain to fulfill business operations
- **Infrastructure** — database access, caching, external service integrations
- **Presentation** — API endpoints, request handling, response formatting

Organize all of this by business feature rather than by technical type.

### Authentication
Provide a fully implemented authentication module:
- Credential-based login with JWT issuance
- Standard JWT validation — designed so that any compliant identity provider can be integrated later
- Validate the BFF's service-to-service identity for backend calls
- Manage and revoke sessions via Redis
- Support token refresh and rotation
- MFA verification (pluggable)
- All relevant endpoints: login, logout, token refresh, MFA verification, current user profile

The identity provider layer is abstracted behind an interface so it can be swapped without touching the rest of the authentication logic.

### Authorization
Backend authorization is authoritative. Implement a combined role-based and attribute-based access control system:
- Roles define what a user type can generally do
- Attributes and policies define fine-grained rules (for example, a user can only see their own account data)
- Every endpoint enforces its permission requirement before doing any work
- A centralized authorization service evaluates policies consistently across the application

### Data & Persistence
- Use PostgreSQL as the primary database
- Use the latest version of Prisma as the ORM, but always behind repository abstractions so business logic never depends on database technology directly
- Domain entities are always mapped to and from database models — they are never the same object

### Common Base Building Blocks
Provide reusable base classes and abstractions that every feature can extend:
- A base entity with common fields: identity, creation and update timestamps, who created and modified the record, a version number for concurrency control, and soft-delete support
- A base repository with standard operations: find, save, update, delete, soft delete, restore, and paginated listing
- A standard API response shape containing success status, data, a message, pagination metadata where relevant, and the correlation identifier
- A standard error shape with an error code, message, safe details, and the correlation identifier
- A base mapper for converting between domain entities, database records, and API response objects
- A standard pagination model for all list endpoints
- A base exception hierarchy with clearly defined error codes mapped to HTTP responses
- A base controller with consistent conventions for pagination, filtering, sorting, and response formatting
- An audit record model for tracking who did what, when, and to which resource

### Security
- Rate limiting on all endpoints, especially authentication
- CORS restricted to known BFF origins
- All inputs validated before any processing begins
- Secrets managed through environment configuration, never hardcoded
- Application-level payload decryption matching the BFF's encryption
- OWASP best practices throughout

### Transaction Management
Multiple database operations that must succeed or fail together are wrapped in transactions. Concurrent updates to the same record are prevented using the version field on entities.

### Caching
Redis-based caching is available for all features through a consistent, swappable cache abstraction. Caching strategies, expiry times, and invalidation are defined per feature.

### Error Handling
A global error handler catches all exceptions and returns consistent, safe error responses. Internal details are never exposed to callers. Every error includes a correlation identifier.

### API Standards
All endpoints follow REST conventions with consistent URL patterns and versioning. Every list endpoint supports pagination, sorting, filtering, and searching in the same way. A request that must not be processed twice (such as a payment) requires an idempotency key. Full API documentation is generated automatically from the code.

### External Integrations
Provide a reusable adapter pattern for connecting to external systems such as core banking (T24), payment gateways, and other enterprise services. Business logic never directly calls these systems — it goes through defined interfaces that the infrastructure layer implements. All external calls have timeouts, retries, circuit breakers, and fallback behavior.

### Audit & Compliance
A centralized audit log records all significant actions: authentication events, authorization decisions, sensitive data access, and financial operations. This is applied consistently using a decorator, not scattered throughout business code.

### Observability
Structured logs, correlation identifiers, health check endpoints, and hooks for metrics and distributed tracing. Logs never contain sensitive data.

### Idempotency
For operations where duplicate processing would cause business harm — payments, transfers, account creation — the framework provides a built-in idempotency mechanism using a client-provided key and Redis-based result caching.

### Configuration
All configuration is typed, validated at startup, and organized by concern (database, auth, Redis, external services, encryption). If required configuration is missing or invalid, the application refuses to start rather than failing silently later.

### Database Migrations
Schema changes are managed through controlled Prisma migrations. Seed scripts are available for development and test environments.

---

## Phase 1 Delivery Scope

### Backend Deliverables
- Full project scaffold with Clean Architecture structure
- All base building blocks (entity, repository, mapper, response, exception, controller, pagination, audit model)
- Encryption and decryption service (matching the frontend)
- Authentication module: login, logout, token refresh, session validation, current user
- Minimal user module: user entity, repository, and basic profile endpoint
- JWT authentication enforcement
- Role and permission-based authorization enforcement
- Global error handler
- Request correlation, logging, and response formatting applied to all requests
- Input validation on all endpoints
- Audit service and decorator
- Redis cache service
- Transaction support
- Idempotency service
- External API client with retry and circuit breaker
- Database schema with base entity fields
- Configuration module with startup validation
- Auto-generated API documentation
- Health check endpoints
- Local development environment (PostgreSQL + Redis via Docker Compose)

### Frontend Deliverables
- Full project scaffold with feature-based App Router structure
- Encryption and decryption service (matching the backend)
- Authentication module: login page, logout, session management, protected routes
- OAuth2/OIDC integration using Auth.js (provider-agnostic, pluggable)
- BFF-to-backend API client with signing and optional encryption
- Data access layer base structure
- Design system setup with the NIB primary and secondary colors, and all configurable theme values
- Base UI components: form, inputs, button, toast, loading states, error boundary
- Data table component styled to match the IB application
- Vertical layout (default) and blank layout (for login)
- Permission-checking hook and permission guard component
- Global error handling
- Server state management setup (TanStack Query) and client state setup (Zustand)
- English and Amharic i18n setup
- Configuration module
- Server-side structured logging
- Security headers configuration

---

## Developer Principles

These rules must be followed throughout the entire framework:

1. Sensitive tokens and credentials are never accessible to the browser under any circumstances.
2. Authorization is always enforced on the backend — the frontend's checks exist only to improve the user experience.
3. Every request carries a correlation identifier from entry to response, and it appears in all logs and error responses.
4. All external service calls go through the centralized external API client — never direct HTTP calls from business code.
5. The domain layer contains no imports from NestJS, Prisma, or any external library.
6. Each use case is its own class with one clear responsibility.
7. Data always flows through mappers — database models and domain entities are never returned directly to API callers.
8. Configuration is validated at startup. Missing or invalid configuration stops the application immediately.
9. Interfaces are defined before implementations — every significant dependency is swappable.
10. Error codes are product-level contracts and must be consistent, documented, and stable.
11. Always use the latest stable version of every package. Document any exception with a clear reason.

---

## Database Configuration

Use the following database connection settings for local development and the Docker Compose setup:

- **Database name**: `appcore`
- **Username**: `postgres`
- **Password**: `User@123456`

These credentials must be reflected in the Docker Compose configuration, the Prisma connection string, and the environment variable templates.

---

## Tech Stack

| Area | Frontend (Next.js BFF) | Backend (NestJS) |
|---|---|---|
| Framework | Next.js (latest) | NestJS (latest) |
| Language | TypeScript strict mode (latest) | TypeScript strict mode (latest) |
| UI Foundation | shadcn/ui (latest) + Radix UI (latest) + Tailwind CSS (latest) | — |
| Authentication | Auth.js (latest) — OAuth2/OIDC, provider-agnostic | JWT (latest libraries) |
| Forms | React Hook Form (latest) + Zod (latest) | — |
| Validation | Zod (latest) | Zod (latest) |
| Server State | TanStack Query (latest) | — |
| Client State | Zustand (latest) | — |
| Database | — | PostgreSQL (latest stable) |
| ORM | — | Prisma (latest) |
| Cache | — | Redis (latest stable) |
| Monorepo | Turborepo (latest) | — |
| Logging | pino (latest) | pino (latest) + nestjs-pino (latest) |
| i18n | next-intl (latest) | — |
| Code Quality | ESLint (latest) + Prettier (latest) | ESLint (latest) + Prettier (latest) |
