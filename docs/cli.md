# AppCore command line

AppCore has three command-line entry points. They share option names, output rules and exit codes.

| Entry point | Run it | For |
|---|---|---|
| Workspace | `npm run appcore -- <command>` in `appcore/` | First-time setup and a health check across both projects |
| Backend | `npm run cli -- <command>` in `backend/` | Operations: users, access control, audit trail, retention, jobs, configuration |
| Frontend | `npm run cli -- <command>` in `frontend/` | Project checks and scaffolding |

`help` lists the commands of an entry point. `help <command>` shows one command's arguments, options, controls and examples.

## Conventions

- **Output.** Results go to stdout; warnings, errors, prompts and logs go to stderr. With `--json`, stdout carries exactly one JSON document, so `… --json | jq` works.
- **Exit codes.** They are stable; scripts and pipelines can branch on them.

  | Code | Meaning |
  |---|---|
  | 0 | Success |
  | 1 | The command ran and failed (database down, business rule, unexpected error) |
  | 2 | A check found a problem (invalid configuration, broken audit chain, pending migrations, missing translations) |
  | 3 | A safety control refused the command (no confirmation, no reason, four-eyes policy) |
  | 64 | Wrong usage (unknown command or option, missing argument) |

- **Colour.** Off when stdout is not a terminal, with `--no-color`, or with `NO_COLOR=1`.
- **Mistakes.** An unknown command or option is an error with a "did you mean" hint. Nothing is silently ignored.

## Workspace: `npm run appcore --`

| Command | What it does |
|---|---|
| `setup` | Creates `backend/.env` and `frontend/.env.local` from the templates, generates the secrets, installs dependencies, applies migrations and seeds development data |
| `doctor` | Checks both projects: backend configuration and database, frontend environment, shared secrets, configuration, translations, routes and API contract |
| `backend <command>` | Runs the backend CLI |
| `frontend <command>` | Runs the frontend CLI |
| `generate <…>` | Runs the feature generator |

`setup` never changes a value that is already set. It fills only missing values and template placeholders. The service identity and the payload key ring get the same value in both files; if one side already has them, the other side is completed from it. Options: `--dry-run`, `--skip-install`, `--skip-db`.

`doctor` options: `--strict` (warnings fail), `--offline` (do not contact the database or backend), `--json`.

## Backend: `npm run cli --`

The backend CLI is part of the application (`backend/src/cli`). It starts the same module graph as the server without the HTTP layer, so a command runs the same use cases, validation and repositories as the API.

- In development, `npm run cli` rebuilds when a source file is newer than the build.
- In production there are no sources. Run `node dist/cli/main.js <command>` in the container or host.

### Commands

| Command | What it does | Changes data |
|---|---|---|
| `config:check` | Validates the environment and reviews it for production readiness | no |
| `config:show` | Prints the effective configuration with every secret removed | no |
| `health` | Checks that PostgreSQL and the key/value store are reachable | no |
| `db:status` | Server version, applied / pending / failed migrations, record counts | no |
| `routes:list` | Every API endpoint with its access rule, audit action and flags | no |
| `permissions:list` | The permission catalogue in code, compared with the database | no |
| `permissions:sync` | Loads the catalogue and standard roles into the database | yes |
| `roles:list` | Roles with permissions and number of users | no |
| `users:list`, `users:show` | Find users; account details | no |
| `users:create` | Creates a user | yes |
| `users:unlock` | Unlocks a locked account | yes |
| `users:reset-password` | Sets a temporary password and ends the user's sessions | yes |
| `users:set-status` | Enables or disables an account | yes |
| `users:roles` | Adds or removes roles | yes |
| `users:revoke-sessions` | Signs a user out everywhere | yes |
| `audit:status` | Size and head of the audit chain, latest checkpoints | no |
| `audit:verify` | Recomputes the whole hash chain and checks the anchors | no |
| `audit:anchor` | Records the chain head as an anchor | yes |
| `retention:preview` | What each retention policy would remove now | no |
| `retention:run` | Runs every retention policy (archive, then purge) | yes |
| `jobs:list`, `jobs:run` | Background jobs; run one now | `jobs:run` |

### Controls on commands that change data

- **Identity.** The operator is the OS account, or `--operator <name>` / `APPCORE_OPERATOR`. Under a shared account (a container shell, a pipeline) set one of these so the audit trail names the person. The operator acts with full authority: whoever can run the CLI already holds the database credentials. The CLI adds accountability.
- **Audit.** Every change, failed attempt and refused bypass is written to the tamper-evident audit trail as `CLI_*`, with the operator, host, command, option names, reason and the field-level changes. Option values are never recorded.
- **Production.** A command that changes data needs `--reason "<why>"` (for example the change ticket) and a confirmation. Without a terminal, pass `--yes`; otherwise the command is refused.
- **Destructive commands** (`retention:run`, `permissions:sync --prune` / `--reset-roles`) ask for confirmation in every environment. `--dry-run` shows the effect without confirmation and without changing anything.
- **Maker–checker.** A command whose action is under four-eyes control (`APPROVAL_ACTIONS`) is refused and the attempt is audited. `--break-glass` applies it directly and records that. `users:set-status` and `users:roles` map to `users.update`.
- **Secrets.** Passwords are never arguments. `users:create` and `users:reset-password` generate a temporary password and show it once, or read one from stdin with `--password-stdin`.

### Bootstrapping a new environment

The development seed refuses to run in production. Use the CLI instead:

```bash
npx prisma migrate deploy
node dist/cli/main.js permissions:sync --reason "initial setup" --yes
node dist/cli/main.js users:create --username admin --email admin@example.com \
  --full-name "Administrator" --role SUPER_ADMIN --reason "initial setup" --yes
```

`permissions:sync` creates what is missing and nothing else. It never changes an existing role, because an administrator may have adjusted it; differences are reported, and `--reset-roles` restores the defaults. Run it after every release that adds permissions.

### Gates for pipelines and schedules

| Use | Command | Fails when |
|---|---|---|
| Before deployment | `config:check --env-file <file> --production --strict` | The environment is invalid or has a warning |
| Before switching traffic | `db:status` | Migrations are pending or one failed |
| Continuous integration | `routes:list --check` | An endpoint declares no authorization |
| Scheduled (daily) | `audit:verify` | The audit chain is broken |

### Limits to know

- **`KV_STORE=memory`.** Sessions and job locks live inside the server process. `users:revoke-sessions`, the session-ending part of `users:reset-password` / `users:set-status`, and the single-instance lock of `jobs:run` have no effect on a running server. The commands warn about it. Use Redis outside local development.
- **Job history.** `jobs:list` shows names and intervals. Last-run status is kept by the server process; see *Security & compliance → Background jobs*.
- **Permission changes** reach a signed-in user at their next token refresh.

### Adding a command

Write a `CliCommand` in `backend/src/cli/commands/*.commands.ts` and list it in `commands/index.ts`. Help, option parsing, the production controls and the audit record come from the kernel. Declare what the kernel should enforce:

```ts
const usersUnlock: CliCommand = {
  name: 'users:unlock',
  summary: 'Unlock an account',
  args: [{ name: 'username', description: 'Sign-in name' }],
  mutates: true,                                   // production: --reason + confirmation
  audit: { action: 'CLI_USER_UNLOCK', category: 'SECURITY', resourceType: 'User' },
  async run(ctx) {
    const user = await findUser(ctx, ctx.args.username!);
    ctx.auditTarget(user.id, { username: user.username });
    const saved = await ctx.get<UnlockUserUseCase>(UnlockUserUseCase).execute(ctx.principal, user.id);
    ctx.out.emit({ user: summary(saved) }, () => ctx.out.success(`"${saved.username}" is unlocked.`));
  },
};
```

Call use cases, not the database, so the command gets the same rules as the API. `boot: 'none'` skips the application (file checks); `boot: 'preview'` loads the module graph without a database.

## Frontend: `npm run cli --`

The frontend CLI (`frontend/src/cli`) runs with `tsx`, without a build step, and uses the project's real environment schema and `app.config.ts`. Nothing in `src/cli` is bundled into the application.

| Command | What it does |
|---|---|
| `doctor` | Runs every check below, plus the API contract and backend reachability |
| `env:check` | Validates the BFF environment and compares the shared secrets with the backend's file |
| `config:check` | Checks `app.config.ts` against the project: pages, translations, icons, feature flags |
| `i18n:check` | Missing keys, placeholder mismatches, untranslated text, unregistered catalogues |
| `routes:list` | Pages and API routes with the access each one requires |
| `make:page <name>` | Scaffolds a page: route, component, translations, optional navigation entry |

- **`env:check`** reports misspelt variables, template placeholders, a secret in a `NEXT_PUBLIC_` variable and one secret used twice. For production it also reports plain HTTP. When `../backend/.env` exists (or `--backend-env <file>`), it compares the service identity, payload key ring, API prefix and single sign-on settings. Secrets are never printed; short fingerprints are.
- **`i18n:check`** treats missing keys, different `{placeholders}`, unregistered catalogues and namespace clashes as errors. Text still in the default language and extra keys are warnings; `--strict` fails on them.
- **`routes:list`** reads the source statically. It never guesses: a handler it cannot read is shown as `custom handler`, for a reviewer to open. These rules decide what the UI shows; the backend enforces access (`backend routes:list`).
- **`make:page`** is for pages that are not record management. For a full CRUD feature with its backend, use the generator. Options: `--title`, `--permission`, `--nav`, `--icon`, `--dry-run`, `--force`.

`npm run check` in `frontend/` now ends with `project:check` (`config:check`, `i18n:check`, `routes:list --check`). `env:check` is not part of it, because a pipeline has no environment file.

## Tests

| Where | What |
|---|---|
| `backend/src/cli/**/*.spec.ts` | Argument parser, runner (production gate, break-glass, audit record, exit codes), configuration review, catalogue sync plan, redaction, password generator |
| `frontend/src/cli/**/*.spec.ts` | Environment review, backend comparison, ICU placeholders, catalogue comparison, route access detection, scaffolding templates, runner |
| `tools/cli/cli.test.mjs` | Environment file preparation, JSON extraction |
