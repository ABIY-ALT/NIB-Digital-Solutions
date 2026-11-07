# AppCore backend (NestJS)

Clean Architecture, organized by feature. Dependencies point inward, and ESLint enforces the layer rules.

```
src/
├── config/                 typed config, Zod-validated at startup (bad config → app refuses to start)
├── core/                   framework building blocks shared by all features
│   ├── domain/             BaseEntity, pagination, Repository contract, AppError hierarchy, error codes, audit model
│   ├── application/        UseCase, mappers, ports (cache, transactions, idempotency, audit, request context…)
│   ├── infrastructure/     Prisma (+ transactions, base repository), key/value store (Redis|memory), cache,
│   │                       crypto (payload encryption, HMAC signature), external API client (retry + circuit breaker),
│   │                       idempotency, rate-limit storage, logging (pino), metrics hook, Argon2 hasher
│   └── presentation/       response envelope, global exception filter, middleware (correlation id, BFF service auth,
│                           payload decryption), interceptors (audit, idempotency, metrics), Zod pipes, list-query parser
└── modules/
    ├── auth/               login, MFA (TOTP/SMS), refresh rotation + reuse detection, logout, OIDC exchange, sessions
    ├── authorization/      RBAC + ABAC (scoped permissions such as users:read:branch), default-deny guard
    ├── users/              user entity, Prisma repository, CRUD use cases (transactional, idempotent, audited)
    ├── audit/              append-only audit trail + paginated query endpoint
    ├── integrations/       core banking port with T24 and mock adapters
    └── health/             /health/live, /health/ready
```

Request pipeline: correlation ID → BFF signature check → payload decryption → rate limit → JWT and session check → permission check → Zod validation → use case → response envelope, with optional encryption.

The error catalogue is in [docs/error-codes.md](docs/error-codes.md). API docs are served at `/docs`.
