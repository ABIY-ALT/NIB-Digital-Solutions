# NIB AppCore CI/CD: setup, gaps and recommendations

_Set up 19 October 2026 by carrying the NibTera pipeline (`nibtera`, `staging` at `251050d`) over to AppCore (`main` at `dd89408`)._

**Scope:** the GitLab pipeline, the staging deployment and the database migrations. It leaves out orchestration, Kubernetes and production deployment.

**What is in place:** every push builds and smoke-tests the three images and pushes them as candidates, never under a release tag. Merge requests into `dev`, `staging` and `main`, and pushes to `dev` and `staging`, run lint, type, contract and route checks, unit and API tests, SonarQube, Semgrep SAST, secret detection, the npm audit gate, a migration check, Trivy, and Snyk (dependencies and images). The image checks run the candidates themselves, by digest. All of them block the pipeline on findings. Only once all of them have passed on a push to `dev` or `staging` does `promote_images` copy the candidates, unchanged, to their release tags; pushes to `staging` then deploy that release to the staging server by digest. How it works: [How a commit becomes a release](#how-a-commit-becomes-a-release).

It is NibTera's pipeline job for job, with the same pinned images, gates, waiver files and rules. This document records what changed for AppCore, what had to be fixed for AppCore to pass the gates, and what still needs GitLab settings or the staging server.

## How AppCore differs from NibTera

| | NibTera | AppCore |
| --- | --- | --- |
| Backend | port 3000; smoke test `GET /` | port 4000; smoke test `GET /health/live`; healthcheck `GET /health/ready` (database and Redis) |
| Frontend | port 3001 | port 3000 (UI and BFF); healthcheck `GET /api/health`; host port 3002 on staging |
| Configuration | `DATABASE_URL` | validated at startup; in production it refuses to start without its secrets, Redis, an explicit CORS list and an audit chain key |
| Key/value store | none | Redis: a `redis` service in both compose files |
| API definition | hand-written `backend/openapi.json` | `contracts/openapi.json`, generated from the controllers; `contract:check` keeps it current |
| Other state | none | retention archives (`ARCHIVE_DIR`): the `archive-data` volume on staging |

**Secrets in CI.** Every job that starts the app generates its own random secrets, so nothing secret-shaped is committed and nothing has to be configured in GitLab for it:

- **Smoke tests:** written to a file the container reads, deleted straight after.
- **Lint and test jobs:** `backend/.env` and `frontend/.env.local` come from AppCore's own `setup --skip-install --skip-db`, the way a developer gets them.

**Jobs AppCore adds.** `test_tools` runs the generator and workspace CLI tests. The `lint` job also runs AppCore's own checks: `typecheck`, `format:check`, `contract:check` and `api:check` (API contract drift), `routes:list --check` (every endpoint declares its authorization) and `project:check` (configuration, translations, page access).

## How a commit becomes a release

_Changed 26 October 2026._

**Before this change,** the build jobs pushed `:<sha>` and the branch tag (`:dev`, `:staging`, `:<feature-branch>`) as soon as the smoke test passed, before any test or scan had run. A branch tag could therefore point at an image that later failed Trivy. Pipelines on `staging` ran only the migration check and the image scans before deploying. They trusted the merge request pipeline for everything else, although the merge commit is not the commit that pipeline tested.

**Now** every image is built once, validated as a **candidate**, and copied unchanged to its release tags by one job, `promote_images`. That happens only after every gate has passed in the same pipeline.

### Stages

| Stage | Jobs | Writes to the registry |
| --- | --- | --- |
| build | `build_backend_image`, `build_frontend_image` | candidates only: `devops/appcore/candidates/<image>:candidate-<sha>-<pipeline>`; and the build cache, `devops/appcore/build-cache:<image>-<branch>` |
| test | `lint`, `test_backend`, `test_frontend`, `test_tools` | nothing |
| quality | `sonarqube_check`, `migration_check` | nothing |
| security | `semgrep-sast`, `secret_detection`, `security_report_gate`, `dependency_scan`, `container_scan`, `snyk_dependency_scan`, `snyk_container_scan` | nothing |
| promote | `promote_images`: pushes to `dev` and `staging` only | `devops/appcore/<image>:<sha>`, and `:dev` or `:staging`, copied by digest |
| deploy | `deploy_staging`: pushes to `staging` only | nothing; the server pulls by digest |

`<image>` is `backend`, `backend-migrate` or `frontend`.

The stages only group the jobs. Each gate starts as soon as the jobs whose output it reads have passed (`needs:`), not when the whole previous stage has finished:

| Job | Starts |
| --- | --- |
| `lint`, the tests, `semgrep-sast`, `secret_detection`, `dependency_scan`, `snyk_dependency_scan` | with the pipeline, alongside the builds |
| `migration_check` | after `build_backend_image` |
| `container_scan`, `snyk_container_scan` | after both builds |
| `sonarqube_check` | after `test_backend` and `test_frontend` (their coverage) |
| `security_report_gate` | after `semgrep-sast` and `secret_detection` |
| `promote_images` | after every gate |

A failed test therefore no longer holds back the scans: every gate reports in the same pipeline. Nothing is promoted unless all of them pass.

**Build cache.** The build jobs run BuildKit in a container (`docker buildx`, pinned `moby/buildkit`) and export the layer cache of every Dockerfile stage to `devops/appcore/build-cache`, one tag per image and branch (`backend-dev`, `frontend-my-feature`, …). A build reads its own branch's cache and `dev`'s, and writes its own branch's. While a lockfile is unchanged, the `npm ci` layers come from the cache instead of being installed again. The cache is only an input to the build: the images are still built, smoke-tested, pushed as candidates and scanned as before, and a build that cannot read or write the cache builds everything.

### Snyk

Two gates check against Snyk's vulnerability database, beside npm audit and Trivy:

| Job | Tests | Fails on |
| --- | --- | --- |
| `snyk_dependency_scan` | the production dependencies in `backend/package-lock.json` and `frontend/package-lock.json` (Snyk Open Source) | an issue at or above `SNYK_SEVERITY_THRESHOLD` (`high`) |
| `snyk_container_scan` | the three candidates, by digest: OS packages and the npm packages in each image (Snyk Container) | the same |

- **Ignoring an issue.** Run `snyk ignore --id=<issue> --reason="…" --expiry=<YYYY-MM-DD>` in `backend/` or `frontend/` and commit the `.snyk` file it writes. That workspace's file applies to its dependencies and to its images. As with the other waiver files, every ignore has a reason and an expiry date.
- **The CLI** is Snyk's standalone Alpine build, downloaded by the job and checked against a pinned SHA-256 (`SNYK_CLI_VERSION`, `SNYK_CLI_SHA256` in `.gitlab-ci.yml`), then cached. Snyk's Docker images have only moving tags, and its npm package installs unpinned dependencies, so neither can be pinned the way the other tools are. Renovate does not update it: take the version and the checksum from `https://downloads.snyk.io/cli/v<version>/snyk-alpine.sha256`.
- **Network:** the jobs reach `downloads.snyk.io` (the CLI), `api.snyk.io` (the tests) and the GitLab registry (Snyk pulls the candidates itself). For Snyk's EU or AU regions, set `SNYK_API` as well.
- **Quota:** every pipeline that runs the gates uses 2 Open Source tests and 3 Container tests. On Snyk's free plan, MR pipelines plus the pipelines after each merge can use up the monthly test limit, and a gate that cannot test fails.

### Which pipelines do what

| Pipeline | Gates | Candidates pushed | Release tags published | Deploys |
| --- | --- | --- | --- | --- |
| Push to a feature branch, no open MR | build and smoke tests only | yes | no | no |
| Push to a feature branch with an open MR | no branch pipeline; the MR pipeline runs | — | — | — |
| MR into `dev`, `staging` or `main` | all | yes | no | no |
| MR into any other branch | build and smoke tests only | yes | no | no |
| Push or merge to `dev` | all, again on the merge commit | yes | `:<sha>`, `:dev` | no |
| Push or merge to `staging` | all, again on the merge commit | yes | `:<sha>`, `:staging` | yes, by digest |
| Push or merge to `main` | build and smoke tests only | yes | **no**: no production release policy exists yet | no |
| Git tag push | build and smoke tests only | yes | no | no |
| Schedule with `RENOVATE=true` | `renovate` only | no | no | no |
| _Run pipeline_ (UI or API) on any branch | none: GitLab creates no pipeline | — | — | — |

"All" means the smoke tests in the build jobs, plus `lint`, `test_backend`, `test_frontend`, `test_tools`, `sonarqube_check`, `migration_check`, `semgrep-sast`, `secret_detection`, `security_report_gate`, `dependency_scan`, `container_scan`, `snyk_dependency_scan` and `snyk_container_scan`.

To deploy again without a new commit, retry `deploy_staging`. To rebuild (to pick up a patched base image, for example), merge a commit.

**Duplicate pipelines.** A push to `dev` or `staging` while a merge request from that branch is open runs two full pipelines for the same commit: the branch pipeline, which releases, and the merge request pipeline, which the merge check needs. That is as before, but both now run every gate. Each pipeline builds and validates its own candidates under its own tag, so they cannot interfere.

### The candidate lifecycle

1. **Build.** Each build job builds its images once from the commit. It labels them with the commit (`org.opencontainers.image.revision`), the project URL, and the pipeline ID (`et.com.nibbank.ci.pipeline-id`). It smoke-tests them as before, then pushes them to `devops/appcore/candidates/` as `candidate-<sha>-<pipeline>`. The tag is unique to the pipeline, so two pipelines for the same commit never overwrite each other's candidates.
2. **Record.** The build job reads the registry digest of each push and records it twice:
   - as a dotenv report: `BACKEND_CANDIDATE_DIGEST`, `MIGRATE_CANDIDATE_DIGEST`, `FRONTEND_CANDIDATE_DIGEST`;
   - in its evidence file, `evidence/build_*.env`.
3. **Validate, by digest.** Each image gate runs the candidates as `candidates/<image>@sha256:…`, never by tag:
   - `migration_check` runs inside the `backend-migrate` candidate;
   - `container_scan` scans all three and writes their SBOMs;
   - `snyk_container_scan` scans all three again, against Snyk's database.

   `migration_check` can only name the image through the dotenv variables, the one kind GitLab expands in `image:`. A CI/CD variable of the same name would take precedence over them. So it first compares the digest it ran with the build job's evidence file, and stops if they differ.
4. **Evidence.** Every gate ends with `.record_evidence`, which writes `evidence/<job>.env`: the job, commit, pipeline, job ID, `result=passed`, and for the image gates the digests they ran. The step runs only if every step before it passed.
5. **Promotion** follows on pushes to `dev` and `staging` (below). On any other pipeline, or when a gate fails, the candidates stay in `candidates/` until the cleanup policy removes them (item 12). Nothing deploys from `candidates/`.

**Access.** GitLab grants registry access per project, so the candidate repositories have the same readers and writers as the release ones. They are kept apart by path (`candidates/`) and by tag (`candidate-…`). Nothing deploys a candidate, and the release tags are written only by `promote_images`, from candidates whose digests and labels it has checked. Full isolation would need a separate GitLab project with its own members, and a write token for it in CI. That is not done here.

### Promotion

`promote_images` needs every gate (`needs:`), so it starts only when all of them have passed. A green job is not taken as proof, though. `.release/promote.sh`:

1. **Checks the evidence** of both build jobs and the 11 gates. Each file must be present and name this commit, this pipeline, `result=passed` and a job ID. `migration_check`, `container_scan` and `snyk_container_scan` must name exactly the digests the build jobs pushed.
2. **Checks each candidate** in the registry: the digest exists, and its labels name this commit and this pipeline.
3. **Copies each candidate by digest** with `regctl image copy`, which transfers the manifest unchanged (layers are mounted; nothing is pulled or rebuilt). It copies to `devops/appcore/<image>:<sha>`, then to `:dev` or `:staging`, and reads every tag back to check that it holds that digest.
4. **Writes the release manifest:** `release/release-manifest.json` and `release/release.env`, kept for a year.

It stops at the first problem. A problem in step 1 or 2 stops it before anything is copied.

- **The list of gates** lives in the script, not in a variable, so no CI/CD variable can shorten it. `promote_images`' `needs:` lists the same jobs. If a gate is missing from a `dev` or `staging` pipeline (after a rules change, say), GitLab refuses to create the pipeline, because `promote_images` needs that gate.
- **Branch tags only move forward.** Before moving `:dev` or `:staging`, the script reads the pipeline label of the image the tag holds. If a newer pipeline has already promoted, the tag stays on that release; this release is still published under its commit SHA. Promotions run one at a time (`resource_group: image-promotion`) and are never cancelled halfway (`interruptible: false`).
- **`:<sha>`** names the last validated build of that commit. Two pipelines for the same commit (a fast-forward merge from `dev` to `staging`, say) each publish their own validated build there. Each pipeline's release manifest names its own digests, and that is what deploys.
- **`main` promotes nothing.** No rule runs `promote_images` there, and the script refuses any branch other than `dev` and `staging`. The `:main` tag is no longer updated.
- **regctl** is `regclient/regctl:v0.11.6-alpine`, pinned by digest. It is the v0.11.6 release (signed tag at commit `c2f83e9`), and the digest is the same on Docker Hub and `ghcr.io`. Renovate proposes updates like any other pinned image.

### The release manifest

`release/release-manifest.json`, an artifact of `promote_images`:

```json
{
  "schemaVersion": 1,
  "project": "devops/appcore",
  "commit": "<sha>",
  "branch": "staging",
  "pipeline": { "id": 4711, "url": "…/-/pipelines/4711" },
  "promotion": { "jobId": 52001, "at": "2026-10-26T08:42:13Z" },
  "images": {
    "backend": {
      "repository": "cicdtesttwo.nibbank.com.et:5050/devops/appcore/backend",
      "digest": "sha256:…",
      "reference": "cicdtesttwo.nibbank.com.et:5050/devops/appcore/backend@sha256:…",
      "tags": ["<sha>", "staging"],
      "candidate": "cicdtesttwo.nibbank.com.et:5050/devops/appcore/candidates/backend@sha256:…"
    },
    "backend-migrate": { "…": "…" },
    "frontend": { "…": "…" }
  },
  "validation": [
    { "job": "build_backend_image", "jobId": 52000 },
    { "job": "lint", "jobId": 51990 }
  ]
}
```

The `validation` list names all 13 jobs, each with its job ID, so every log can be found again. `tags` lists only the tags this run wrote; `staging` is missing when a newer pipeline already held it. `release/release.env` holds the commit, pipeline, branch and the three digests as `KEY=value` lines, for `deploy_staging`.

### Deployment

`deploy_staging` needs `promote_images` and deploys nothing else:

1. It reads `release/release.env` from that job's artifact, not from variables, which a CI/CD variable could override. It stops unless the file is the `staging` release of this commit from this pipeline, with three `sha256:` digests. Nothing else reaches the command run on the server.
2. On the server, `docker-compose.staging.yml` names each image by digest (`…/backend@${BACKEND_DIGEST:?…}`). Before pulling anything, the deploy checks that `docker compose config --images` resolves `backend-migrate`, `backend` and `frontend` to exactly the approved digests in the release repositories.
3. It runs `config:check`, the backup, the migrations and the start as before. Once both healthchecks pass, it checks that the three containers run the image IDs of the approved digests.
4. It records `MIGRATE_DIGEST`, `BACKEND_DIGEST` and `FRONTEND_DIGEST` in `.env`, replacing the old `IMAGE_TAG`, and only then removes the images of earlier releases.

Nothing is built on the server, and no tag is pulled: Docker checks a pull by digest against the content.

### When a pipeline fails

- **Before promotion** (a gate fails, or the evidence is incomplete): no release tag is written. `:dev` and `:staging` keep the last validated release, and staging keeps running it. The candidates stay until the cleanup policy removes them.
- **During promotion** (a registry error while copying): the tags written so far hold validated digests from this pipeline, and the branch tag may have moved for some images and not others. Retry `promote_images`; it is idempotent. Nothing deploys until it succeeds.
- **During deployment:** as before. Staging keeps the previous containers when `config:check`, the backup or the pull fails. A failed healthcheck or image check leaves `.env` on the previous release, so `docker compose up -d` on the server returns to it. The release tags stay published either way.

### Example: a commit merged into `staging`

1. A merge request from `dev` to `staging` runs every gate on its own candidates (`candidate-a1b2…-4700`) and publishes nothing. The merge check needs it to pass.
2. The merge creates commit `c3d4…` on `staging`, which starts push pipeline 4711. It builds `candidates/backend:candidate-c3d4…-4711` and the other two candidates, and records their digests: `backend` is `sha256:9f3e…`, for example.
3. Lint, the tests, SonarQube, the migration check, SAST, secret detection and the npm audit run on `c3d4…`. Trivy and Snyk scan the candidates by digest, `backend@sha256:9f3e…` among them.
4. Everything passes. `promote_images` checks the 13 evidence files and the candidates' labels. It copies `candidates/backend@sha256:9f3e…` to `backend:c3d4…` and to `backend:staging`, both still `sha256:9f3e…`, does the same for the other two, and writes the release manifest.
5. `deploy_staging` checks that the manifest is pipeline 4711's `staging` release of `c3d4…`. The server pulls `backend@sha256:9f3e…`, which is exactly what Trivy and Snyk scanned.

Had Trivy found a fixable CRITICAL in step 3, the pipeline would have stopped there. `:staging` would have stayed on the previous release, and staging would have kept running it.

### Rollback

Retry `deploy_staging` in the pipeline of the release to return to, or use **Operate → Environments → staging → Rollback**. Either redeploys that pipeline's release by digest (from its `release.env`, kept for a year) with that commit's compose file. The registry must still hold those digests: within the cleanup policy's window (item 12), or for as long as a tag still points at them.

A release deployed before this change, by `IMAGE_TAG`, can still be redeployed: that pipeline's own deploy job and compose file are used. Migrations are never undone (item 4).

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Build job: `could not read the registry digest of a pushed candidate` | The push gave no digest for `candidates/<image>`. Check the push output above it; the job's registry login must be allowed to push to the project's registry. |
| `migration_check` cannot pull `…/candidates/<image>@` (empty digest, `invalid reference format`) | The job received no dotenv variables from the build jobs: a build job failed, or the job's `needs:` or `dependencies:` were changed so it no longer downloads their artifacts. |
| A candidate pull fails with `unauthorized` or `denied` | The job token cannot read the project's registry. Check that the container registry is enabled for the project, and the job token settings under **Settings → CI/CD**. |
| `ERROR: this job ran <image> …, but the build job pushed the candidate …` | A project, group or pipeline variable named `BACKEND_`, `MIGRATE_` or `FRONTEND_CANDIDATE_DIGEST` overrides the dotenv one. Remove it. |
| A gate fails with `Permission denied` writing `evidence/` | Jobs that run as another user (`node`, `appuser`) write into the build directory. The runner's default (`umask 0000`, or `FF_DISABLE_UMASK_FOR_DOCKER_EXECUTOR` with its ownership fix) allows it. Check the runner's configuration. |
| `promote_images`: `no evidence from <job>` | The gate does not end with `.record_evidence`, does not list `evidence/<job>.env` under `artifacts:paths`, or is missing from `promote_images`' `needs:`. Every gate needs all three. |
| `… has commit=…` or `… has pipeline=…` | The evidence came from another commit or pipeline. Run a new pipeline. |
| `<gate> validated <image> X, but the build job pushed Y` | A build job was retried after that gate ran, so the gate validated an earlier build. Run a new pipeline instead of retrying jobs in this one. |
| `… was built from commit …` or `… was built by pipeline …` | The candidate in the registry is not this pipeline's build: someone pushed to `candidates/` by hand. Run a new pipeline. |
| `could not copy …` or `… holds … after the copy` | A registry error, or something else wrote the tag during the copy. Retry `promote_images`. |
| `kept on the release of pipeline N, which is newer` | Not an error: a newer pipeline already promoted to this branch, and its release keeps the tag. |
| Deploy: `release/release.env is missing` | `promote_images`' artifacts have expired or been deleted. Run a new pipeline. |
| Deploy: `must each run the image promote_images approved` | `docker-compose.staging.yml` no longer names the three images by `@${…_DIGEST}` in the release repositories. |
| Deploy: `<service> runs image …, not …` | After `up -d`, a container runs another image. Staging may be half-updated: check `docker compose ps` on the server, then retry the deploy or roll back. |
| Server: `manifest unknown` while pulling | The release's digests have left the registry (cleanup policy), typically when rolling back past the window. Deploy a newer release, or rebuild the old commit. |

## Summary

| # | Recommendation | Priority | Where the change is made | Effort |
| --- | --- | --- | --- | --- |
| 1 | Protect the branches and the CI/CD variables | Must | GitLab settings | S |
| 2 | Publish only validated images, and deploy them by digest (**done**) | Must | `.gitlab-ci.yml`, `.release/promote.sh`, compose file | M |
| 3 | Test migrations in the merge request (**done**) | Must | `.gitlab-ci.yml` | M |
| 4 | Back up the database before migrating (**done**) | Must | compose file, deploy script | S |
| 5 | Pin the staging server's SSH host key (**done**; needs the variable) | Must | `.gitlab-ci.yml`, CI/CD variable | S |
| 6 | Check that the deploy worked, one deploy at a time (**done**) | Must | backend, compose file, `.gitlab-ci.yml` | M |
| 7 | Lint and tests in CI (**done**) | Must | `.gitlab-ci.yml`, backend, frontend | M–L |
| 8 | Separate database users for migrations and the app | Must | PostgreSQL, env files, compose file | M |
| 9 | Expose less on the staging server (**partly done**) | Should | compose file | S |
| 10 | TLS for staging | **Must for AppCore** | nginx on the server | S–M |
| 11 | Pin tool image versions (**done**) | Should | `.gitlab-ci.yml`, compose files | S |
| 12 | Registry cleanup policy | Should | GitLab settings | S |
| 13 | Dependency updates and SBOMs (**done**; Renovate needs a token and a schedule) | Should | Renovate, `.gitlab-ci.yml` | M |
| 14 | Pipeline housekeeping and alerts (**done**; alerts need GitLab settings) | Should | `.gitlab-ci.yml`, GitLab settings | S |

Effort is a rough estimate: S is under half a day, M is a day or two, L is longer.

Before the first pipeline, do the one-time setup at the end of this document.

---

## Must have

### 1. Protect the branches and the CI/CD variables

**Why.** A direct `git push` to `staging` now runs every gate before it publishes and deploys, but it still skips review. Any developer can also push a branch whose `.gitlab-ci.yml` prints `$STAGING_SSH_PRIVATE_KEY`, unless the variable is protected. And whoever can start a pipeline with variables can change what the gates check (`SAST_LEVEL`, `AUDIT_LEVEL`, …).

**What to do.** The same as NibTera, plus the last point:

- **Settings → Repository → Protected branches.** For `dev`, `staging` and `main`, set _Allowed to push_ to **No one** and _Allowed to merge_ to **Maintainers**.
- **Settings → Merge requests → Merge checks.** Turn on **Pipelines must succeed** and **All threads must be resolved**.
- **Settings → CI/CD → Variables.** Mark `STAGING_SSH_PRIVATE_KEY`, `STAGING_SERVER`, `STAGING_USER`, `STAGING_SSH_PORT` and `STAGING_SSH_KNOWN_HOSTS` as **Protected**.
- **`SONAR_TOKEN` can't be protected** (MR pipelines run on unprotected branches). Mask it, and use a project analysis token that can only _Execute Analysis_ on `appcore`.
- **`SNYK_TOKEN` can't be protected either**, for the same reason. Mask it, and use a Snyk service account token with the narrowest role your plan offers, not a personal token.
- **Settings → CI/CD → Variables → Minimum role to use pipeline variables:** **No one allowed** (or Maintainer). This covers variables given to _Run pipeline_, the API and `git push -o ci.variable=…`.

### 2. Publish only validated images, and deploy them by digest

**Status: done** (26 October 2026). It replaces deploying by commit SHA, which NibTera still does. Details: [How a commit becomes a release](#how-a-commit-becomes-a-release).

- **Candidates, then promotion.** The build jobs push candidates only. `promote_images` publishes `:<sha>` and `:dev` or `:staging` once every gate has passed in the same pipeline, by copying the exact candidate manifests.
- **Every gate on `dev` and `staging`.** Pushes there run all the gates again, on the merge commit, rather than trusting the merge request pipeline, which tested a different commit.
- **Deploy by digest.** `docker-compose.staging.yml` takes each AppCore image's digest from `MIGRATE_DIGEST`, `BACKEND_DIGEST` and `FRONTEND_DIGEST`, with no fallback to a tag. `deploy_staging` sets them from the release manifest of its own pipeline.
- **The image check, adapted.** AppCore's `backend` depends on `redis`, so `docker compose config --images` lists the Redis image too. The deploy therefore requires exactly the three AppCore images (`backend-migrate`, `backend`, `frontend`) to be the release's, by digest. Redis is pinned by digest in the compose file itself.
- **Rollback.** Retry `deploy_staging` in an older pipeline, or use **Operate → Environments → staging → Rollback**. Migrations are not undone (see item 4).

### 3. Test migrations in the merge request

**Status: done.** `migration_check` runs inside the `backend-migrate` image the pipeline built, against an empty PostgreSQL. It applies every migration, runs the setup a second time, and fails when `schema.prisma` has a change no migration contains.

- **`backend/scripts/db-setup.js`** is new in AppCore, ported from NibTera. It creates the database when it is missing, then runs `prisma migrate deploy`. The migrate container, `migration_check` and the API tests' global setup all run it. `npm run db:setup` / `db:setup:staging` run it locally.
- **`backend/prisma.config.ts` changed.** It used Prisma's `env('DATABASE_URL')`, which throws when the variable is unset, so `npm ci` failed in its `postinstall` (`prisma generate`) on any fresh checkout: CI and the Docker build. Like NibTera, it now leaves the datasource out when `DATABASE_URL` is unset.
- **AppCore's raw SQL** (the triggers that make `audit_logs` append-only) applies on PostgreSQL 17, and Prisma's diff ignores triggers, so they don't count as drift.

### 4. Back up the database before migrating

**Status: done,** as in NibTera: the `db-backup` service writes `backups/appcore-<UTC time>.dump` before `migrate` runs, skips a database that does not exist yet, deletes dumps older than 14 days, and stops the deploy on any other failure.

**Restoring after a bad migration.** On the staging server:

```sh
cd /home/getayet/appcore
ls backups/                                   # pick the dump taken before the bad deploy
docker compose -f docker-compose.staging.yml stop backend frontend
docker compose -f docker-compose.staging.yml run --rm -T --entrypoint sh db-backup -c \
  'pg_restore --clean --if-exists --no-owner --single-transaction --dbname "${DATABASE_URL%%\?*}" /backups/appcore-YYYYMMDD-HHMMSS.dump'
```

Then redeploy the build that matches that schema (item 2).

**Checked locally:** this command restores an AppCore dump over a database that already holds its data, the append-only audit trail included. `--clean` drops and recreates the tables, which the audit triggers do not block.

### 5. Pin the staging server's SSH host key

**Status: done in the pipeline,** as in NibTera. The deploy refuses to run until `STAGING_SSH_KNOWN_HOSTS` holds the server's host key.

**One-time setup:**

1. **Record the key** from a machine you trust: `ssh-keyscan -p <STAGING_SSH_PORT> <STAGING_SERVER> > staging_known_hosts`, then `ssh-keygen -lf staging_known_hosts`.
2. **Check the fingerprints on the server itself:** `for key in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$key"; done`. They must match.
3. **Create the variable** `STAGING_SSH_KNOWN_HOSTS` with the file's contents: Protected yes, Masked no.

If AppCore deploys to the same server as NibTera, the same value works for both projects.

### 6. Check that the deploy worked, one deploy at a time

**Status: done,** as in NibTera: `resource_group: staging`, the compose file sent from the commit, healthchecks on both services, a post-deploy wait for both to be healthy, and `.env` naming the last healthy build. AppCore adds two steps of its own:

- **Before anything changes:** the release checks `backend/.env.staging` with its own `config:check`. A setting the release needs and the file lacks, a template placeholder left in, a key reused for two purposes, or the development database password all stop the deploy before the backup and the migrations. Warnings (plain HTTP, Redis without TLS, no `sslmode`) are printed and do not stop it.
- **After it is healthy:** `permissions:sync` adds the permissions and standard roles the release defines and the database lacks. It changes nothing that exists. The audit trail records it as `CLI_PERMISSIONS_SYNC` under `cli:gitlab-ci.<GitLab user>`. On a first deploy it loads the whole catalogue.

The healthchecks are `GET /health/ready` (database and Redis) for the backend, and `GET /api/health` for the frontend. The frontend's probe only answers when the BFF's secrets validate.

### 7. Lint and tests in CI

**Status: done.** The `test` stage runs four jobs on merge requests into `dev`, `staging` and `main`:

| Job | Runs | Fails when |
| --- | --- | --- |
| `lint` | eslint and tsc in both projects, prettier on the frontend, `contract:check`, `api:check`, `routes:list --check`, `project:check` | any check fails |
| `test_backend` | 136 unit tests, then 17 API tests against PostgreSQL | any test fails |
| `test_frontend` | 248 unit tests | any test fails |
| `test_tools` | 8 generator and workspace CLI tests | any test fails |

- **New: the backend API tests** (`backend/test/app.e2e-spec.ts`, `vitest.e2e.config.ts`, `test/global-setup.ts`).
  - They boot the whole app over HTTP, set up as `main.ts` sets it up, against a throwaway PostgreSQL, migrated and seeded first. Requests are signed the way the BFF signs them.
  - Covered: both probes; the security headers on probes, refusals, unknown routes and paths outside the API; the BFF signature (unsigned, tampered body, replayed nonce); sign-in, the profile with and without a token, a wrong password, and a login body with an extra field.
  - **They refuse to run unless the database name ends in `_test`, `_ci` or `_e2e`:** the audit trail is append-only, so never point them at a shared database.
  - Locally: `DATABASE_URL="postgresql://postgres@localhost:5432/appcore_test?schema=public" npm run test:e2e`.
  - Nest resolves dependencies from decorator metadata, which Vitest's default compiler does not emit, so the API tests run through SWC (`unplugin-swc`, `@swc/core`), as NibTera's do.
- **The unit tests need an environment.** Importing the configuration module validates the environment, so `npm test` on a checkout without `backend/.env` reported an unhandled error and failed. CI creates the file first (see Secrets in CI); developers have it from `npm run appcore -- setup`.
- **Coverage:** JUnit reports show on the merge request; lcov goes to SonarQube with paths relative to the repository root. Left out of coverage, with the reasons in `sonarqube_check`: config files, and the files the pipeline runs as their own process (`main.ts`, `openapi-export.ts`, the two CLI entry points, `backend/scripts`, the seed, `frontend/scripts`).
- **Coverage today** (line coverage, from the CI run): backend about 50% (unit tests 28% and API tests 29%, merged), frontend 25%.

**The SonarQube Quality Gate.** NibTera's gate requires 80% coverage on new code, and AppCore's existing code is below that. If the server counts the whole codebase as new on the first analysis, as a "Number of days" new-code definition would (the history is days old), the first `sonarqube_check` fails. Before the first analysis, set the `appcore` project's **New Code** definition to **Previous version** or a reference branch, so the gate measures changes from then on. Keep the gate at 80% for new code.

### 8. Separate database users for migrations and the app

**Why.** As in NibTera, `migrate` and `backend` read the same `DATABASE_URL`, so the running API holds the privileges migrations need.

**What to do.** Create `appcore_migrator`, which owns the schema and is used only by `migrate`, and `appcore_app`, which can only read and write rows:

```sql
GRANT USAGE ON SCHEMA public TO appcore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appcore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appcore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE appcore_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appcore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE appcore_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO appcore_app;
```

Give `migrate` its own env file and drop the shared `x-database` block for it. `db-setup.js` creates the database when it is missing, which needs `CREATEDB`: grant it to the migrator only, or create the database once by hand. After the split, run the retention job once (_Security & compliance → Background jobs_) to confirm it can still purge through the audit trigger.

---

## Should have

### 9. Expose less on the staging server

**Done for AppCore:** the backend is published on `127.0.0.1:4000` only (browsers never call it; the BFF does, over the Compose network), and Redis is not published at all.

**Still to do:** the container hardening from NibTera's item 9 (`no-new-privileges`, `cap_drop: [ALL]`, `read_only` with `tmpfs` for `/tmp`, memory limits, log rotation). The backend writes only to `/app/storage` (a volume); the Next.js server needs a writable `.next/cache`. Test `read_only` before rolling it out.

### 10. TLS for staging (**a must for AppCore**)

**Why.** The deploy works over plain HTTP: the healthchecks are server-side. A browser cannot use the site that way, though. In a production build:

- the Content-Security-Policy carries `upgrade-insecure-requests`, so the browser fetches every script and stylesheet of `http://<server>:3002` over `https://` instead, which fails;
- the session cookie is `__Host-appcore.session` and Secure (the local test confirmed it), so a browser drops it over HTTP and sign-in cannot complete;
- HSTS is sent.

Browsers treat `localhost` as a secure origin and exempt it from all three, which is why `docker-compose.local.yml` works in a browser.

**What to do.** Put staging behind the nginx already on the server, with an internal certificate:

```nginx
server {
    listen 443 ssl;
    server_name appcore-staging.nibbank.com.et;            # your name for it
    ssl_certificate     /etc/nginx/tls/appcore-staging.crt;
    ssl_certificate_key /etc/nginx/tls/appcore-staging.key;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then:

- set `AUTH_URL` (frontend), `PUBLIC_APP_URL` and `CORS_ORIGINS` (backend) to the `https://` address;
- bind the frontend to `127.0.0.1:3002:3000` in `docker-compose.staging.yml`;
- change `environment:url` in `deploy_staging` to the `https://` address.

### 11. Pin tool image versions

**Status: done.** Every pin is NibTera's (the same versions and digests), plus the images AppCore needs:

| Image | Pinned to | Released | Used by |
| --- | --- | --- | --- |
| `redis` | 8.10.2-alpine | 2026-09-24 | the `redis` service in both compose files |
| `moby/buildkit` | v0.33.1 (`buildx-stable-1`) | 2026-09-30 | the build jobs' BuildKit builder (`CI_BUILDKIT_IMAGE`) |

The Dockerfiles' `FROM node:24-alpine` base images are left for Renovate to pin, as in NibTera.

### 12. Registry cleanup policy

Every push now adds candidates (`devops/appcore/candidates/*`, tags `candidate-<sha>-<pipeline>`) and a build cache tag per branch (`devops/appcore/build-cache`, tags `<image>-<branch>`), and every push to `dev` or `staging` that passes adds approved `:<sha>` tags (`devops/appcore/*`). The pipeline itself never deletes a tag. In **Settings → Packages and registries → Container registry → Cleanup policies**:

- **Run cleanup:** every day.
- **Keep the most recent:** 10 tags per image name.
- **Keep tags matching:** `((backend|backend-migrate|frontend)-)?(dev|staging)` (GitLab anchors the pattern itself, so no `^` or `$`).
- **Remove tags older than:** 30 days.
- **Remove tags matching:** `.*`.

One policy covers every kind of repository:

- **Candidates** go 30 days after their pipeline, whether it passed or failed. No pipeline uses one for that long. A `promote_images` retried after that fails, because the candidate is gone.
- **Approved `:<sha>` tags** go after 30 days unless they are among the 10 most recent of their image. That is also the rollback window (see the rollback section).
- **Build cache** of a branch goes 30 days after its last build, unless it is among the 10 most recent; `dev`'s and `staging`'s stay. A build without a cache only takes longer.
- **Old tags** age out the same way: `:main` (no longer updated) and the tags of the earlier tag-based builds (`:<feature-branch>`, and `:<sha>` tags pushed before validation). Keep `main` in the keep list if anything outside this repository still pulls `:main`.

Keep `dev` and `staging` in the keep list: they hold the current releases, and every branch's builds start from `dev`'s cache.

### 13. Dependency updates and SBOMs

**Status: done; Renovate needs a one-time setup.**

- **Renovate:** the same job and schedule as NibTera. `renovate.json` groups NestJS, Prisma, Next.js, React, Vitest and typescript-eslint, and adds AppCore's own guard rails:
  - TypeScript stays on 6 (the NestJS 12 CLI requires it);
  - `@types/node` stays on 24;
  - the CI database stays on PostgreSQL 17;
  - Redis is picked up in both compose files, and BuildKit through the `# renovate:` comment above `CI_BUILDKIT_IMAGE`.
- **SBOMs:** `container_scan` writes one CycloneDX SBOM per image, kept for a year.

**One-time setup:**

1. **Token:** a project access token `renovate-bot` (role Developer, scopes `api` and `write_repository`), saved as the masked, protected variable `RENOVATE_TOKEN`.
2. **Schedule:** a pipeline schedule on `dev` (for example daily at 06:00 Africa/Addis_Ababa) with the variable `RENOVATE` = `true`.

**Dependencies changed to pass the npm audit gate.** The first run blocked on 7 advisories, most reaching production code:

| Advisory | Package | Fix |
| --- | --- | --- |
| GHSA-cjq9-62q9-8jv4 (high) | `next` < 16.3.8 | `next` and `@next/eslint-plugin-next` 16.3.6 → 16.3.8 |
| GHSA-wq5f-xc86-pv6w (high) | `sharp` < 0.35.5 (under `next`) | 0.35.4 → 0.35.5 in the lockfile |
| GHSA-p6vx-979v-rg4c (critical), GHSA-jp82-f5mq-hwhp (high) | `seroval` ≤ 1.6.2 (under `@tanstack/react-query-devtools` → `solid-js`) | `overrides` to 1.6.8 in `frontend/package.json` |
| GHSA-68fv-2mgg-jv7q (high) | `source-map-js` < 1.2.2 | 1.2.1 → 1.2.2 in both lockfiles |
| GHSA-3f6p-5ww8-9rcr (high), GHSA-ggr8-5vv4-36mx (high) | `mysql2`, `deepmerge-ts` (under `prisma`) | NibTera's two `overrides` in `backend/package.json` |
| GHSA-vfj7-8cjw-p6xm (high) | `braces` (dev only, no fix exists) | waived in `.npm-audit/waivers.tsv`, as in NibTera |

- **The `seroval` override** stays only until `solid-js` 1.9.16, which depends on the fixed `seroval` itself, is 14 days old (it was published 2026-10-06): then drop the override.
- **The two-week rule.** Every version added or changed was published on or before 5 October 2026, at least two weeks earlier, as NibTera's rule requires.

**26 October 2026: three new advisories,** found by both `dependency_scan` and `container_scan` (Trivy, in the backend runtime image), all in the production tree:

| Advisory | Package | Fix |
| --- | --- | --- |
| GHSA-27r3-jxmh-p828 / CVE-2026-111181 (high) | `body-parser` 2.3.0 (under `express`) | 2.4.0 in the backend lockfile (with `qs` 6.16.0 → 6.16.1, which it requires) |
| GHSA-q7qp-rjg7-q26m / CVE-2026-113872 (high) | `multer` 2.4.0 (pinned by `@nestjs/platform-express`) | `overrides` to `^2.5.0` in `backend/package.json` |
| GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 (high) | `zod` 4.6.5 (direct dependency) | 4.6.6 in both workspaces |

- **The `multer` override** stays until `@nestjs/platform-express` depends on `multer` 2.5.0 or later itself; 12.2.0, the latest today, still pins 2.4.0. Then drop the override.
- **The two-week rule does not apply to security fixes,** as in Renovate's `vulnerabilityAlerts`. `body-parser` 2.4.0 and `multer` 2.5.0 were 4 days old and `zod` 4.6.6 was 15 days old, all published from their GitHub repositories with npm provenance. `qs` 6.16.1, which `body-parser` 2.4.0 requires, was 12 days old, published by its long-standing maintainer (`qs` has never published provenance). `zod` stays on 4.6.6, the fixed version, rather than 4.6.7.
- **Only these entries changed** in the lockfiles. Regenerating them with npm 11.19 also rewrites unrelated metadata (`peer` flags, bundled entries), so that was left out.

**27 October 2026: the first Snyk run** (`snyk_dependency_scan` and `snyk_container_scan`) blocked on two advisories that npm audit and Trivy do not report:

| Advisory | Package | Fix |
| --- | --- | --- |
| SNYK-JS-NODEMAILER-21663365, -21663367, -21663373 (high, interpretation conflicts in the address parser) | `nodemailer` 10.0.13 (direct dependency, backend) | 10.1.7 in `backend/package.json` and the lockfile |
| SNYK-JS-PICOMATCH-21248802 (high, ReDoS) | `picomatch` 4.0.7: dev-only in `backend/` (`vite`, Nest CLI); in `frontend/` under `next-intl` → `@parcel/watcher`, which is not in the runtime image | no fixed version exists: ignored until 2027-01-27 in `backend/.snyk` and `frontend/.snyk`, with the reasons |

- **10.1.7, not 10.1.4.** 10.1.4 fixes the advisories by rewriting the address parser; 10.1.5 to 10.1.7, released the same day, fix that rewrite. All four are 9 days old and published from GitHub with npm provenance (the security exception to the two-week rule, as above).
- **Only the `nodemailer` entries changed** in the backend lockfile, as before.

### 14. Pipeline housekeeping and alerts

**Status: done in the repository;** alerts need GitLab settings, as in NibTera (pipeline status emails, or Teams/Slack notifications for broken pipelines and deployments).

**SAST and secret detection.** The first scans (GitLab's Semgrep and secrets analyzers, version 7) found nothing in the files the pipeline adds, and these in AppCore's existing code:

- **Secrets:** 4 "Password in URL" findings: the documented development password in `backend/.env.example`, and test fixtures in `backend/src/cli/support/support.spec.ts`. The full history (3 commits) holds the same four, all from the first commit. They are waived by file, for that rule only.
- **SAST:** 48 findings at medium or above. 19 were in developer tooling that never ships (`tools/`, and `frontend/src/cli`, which the standalone build leaves out). `SAST_EXCLUDED_PATHS` skips both, as it skips tests. The other 29 (18 rule and file pairs) were read in context and are false positives. Each is waived in `.security-gate/waivers.tsv` with its reason, expiring after six months.

`backend/src/cli` ships (`node dist/cli/main.js`) and is still scanned.

---

## One-time setup before the first staging deploy

1. **CI/CD variables** (**Settings → CI/CD → Variables**; protected unless noted):
   - `STAGING_SSH_PRIVATE_KEY`, `STAGING_SERVER`, `STAGING_USER`, `STAGING_SSH_PORT` and `STAGING_SSH_KNOWN_HOSTS` (item 5);
   - `SONAR_HOST_URL` and `SONAR_TOKEN` (masked, not protected, item 1);
   - `SNYK_TOKEN` (masked, not protected, item 1), and `SNYK_CFG_ORG` if the Snyk account has more than one organization ([Snyk](#snyk));
   - `RENOVATE_TOKEN` (item 13).
2. **SonarQube:** create the `appcore` project and set its New Code definition (item 7).
3. **The server directory** `/home/getayet/appcore`, with:
   - `backend/.env.staging`, from `backend/.env.staging.example`;
   - `frontend/.env.staging`, from `frontend/.env.staging.example`.

   Fill the secrets with fresh values from `cd backend && npm run keys:generate`: the service identity and the payload key ring must match in both files. Add the database user and password, and the `https://` addresses (item 10). These files never go into git.
4. **Registry access from the server:** `docker login cicdtesttwo.nibbank.com.et`, as the user the deploy logs in as, with a deploy token that can read AppCore's registry (`read_registry`). NibTera's login on the same server may not cover the AppCore project.
5. **The runner's network.** The frontend build downloads its font from Google at build time (`next/font/google` in `frontend/src/app/layout.tsx`), so the Docker-in-Docker build must reach `fonts.googleapis.com` and `fonts.gstatic.com`. If it cannot, switch to `next/font/local` with the font file committed. The runner must also be able to pull `regclient/regctl` from Docker Hub, like the other pinned images.
6. **For the image lifecycle** ([How a commit becomes a release](#how-a-commit-becomes-a-release)):
   - **The registry cleanup policy** (item 12).
   - **Pipeline variables:** minimum role **No one allowed** (item 1).
   - **Keep on** (**Settings → CI/CD → General pipelines**, both on by default): **Auto-cancel redundant pipelines**, so a newer push cancels the older pipeline's gates; and **Prevent outdated deployment jobs**, with job retries for rollback allowed, so an older pipeline cannot deploy over a newer one but a rollback still can.
   - **Optional, if your GitLab version has protected container tags** (**Settings → Packages and registries → Container registry**): protect `^([0-9a-f]{40}|dev|staging)$` with push restricted to Maintainers. Then only pipelines started by a maintainer (merges into the protected branches) can write release tags, and a developer cannot push one by hand. Candidate tags (`candidate-…`) don't match, so merge request pipelines can still push them. Check how your version's cleanup policy treats protected tags first.
7. **The first pipelines after this change.** Check each of these once:
   - **A merge request:** `devops/appcore/candidates/*` appears in the registry, and `migration_check` pulls its image by `@sha256:`.
   - **A push to `dev`:** `promote_images` publishes `:<sha>` and `:dev`.
   - **A push to `staging`:** the deploy log names the three digests, and on the server `.env` holds `MIGRATE_DIGEST`, `BACKEND_DIGEST` and `FRONTEND_DIGEST`.
8. **The first administrator,** after the first deploy (which has loaded the permissions):

   ```sh
   cd /home/getayet/appcore
   docker compose -f docker-compose.staging.yml exec backend node dist/cli/main.js users:create \
     --username admin --email admin@nib.et --full-name "Administrator" --role SUPER_ADMIN \
     --operator "<your name>" --reason "initial setup" --yes
   ```

   The temporary password is shown once and must be changed at first sign-in. The development seed refuses to run in production.

## Verified locally

All of this ran on a copy of the repository with LF line endings, as GitLab checks it out, in the pinned images:

- **`lint`, `test_backend`, `test_frontend`, `test_tools`:** the job scripts as written, in `node:24.21.0-alpine`. `test_backend` ran against a PostgreSQL 17.11 service aliased `postgres`. The JUnit and lcov files appeared where the CI file expects them.
- **Images:** all three build. The backend smoke test passed in production mode with only generated secrets (`argon2` and `pdfkit` work in the runtime image). The frontend smoke test passed with no backend.
- **`migration_check`:** passed. A model added to `schema.prisma` without a migration failed it, naming the table.
- **`container_scan`:** Trivy 0.75.0 found no fixable HIGH or CRITICAL vulnerability in any of the three images.
- **`dependency_scan`:** the npm audit gate passed, with the one `braces` waiver.
- **`security_report_gate`:** passed against the real Semgrep and secrets reports, including the full-history secrets report.
- **`docker-compose.local.yml`:** came up against a stand-in for the host's PostgreSQL. The first user was bootstrapped with the CLI, and a sign-in through the BFF reached a session and the profile.
- **`deploy_staging`:** the server-side script, extracted from `.gitlab-ci.yml` and expanded as the runner expands it, ran against a scratch server directory with a stand-in database. Only `pull` and the image cleanup were skipped (they need the registry).
  - First deploy: the backup was skipped, the catalogue was loaded, and both services became healthy.
  - Second deploy: a valid dump was written, `.previous` was kept, and the sync reported nothing to do.
  - A placeholder left in `backend/.env.staging` stopped the deploy at `config:check`, before the backup, with the old build still running.

**Not verifiable here:** GitLab itself (template versions, runner, registry, SonarQube server), SSH to the real server, and Renovate against GitLab's API.

### The image lifecycle (26 October 2026)

Checked on a copy of the repository, and in the pinned images where noted:

- **The pipeline definition.** `.gitlab-ci.yml` parses, and validates against GitLab's CI JSON schema (`ci.json` from `gitlab-org/gitlab`) and in `gitlab-ci-local` 4.76.1, which also loaded the SAST and Secret Detection templates from gitlab.com.
- **Rules and `needs:`.** These were simulated for 12 pipeline types (the table under [Which pipelines do what](#which-pipelines-do-what)). Every `needs:` resolves in every pipeline. `promote_images` exists only on pushes to `dev` and `staging`, and `deploy_staging` only on `staging`. `gitlab-ci-local` lists the same jobs. The same simulation reproduces the old pipeline's behaviour from `HEAD`. Twelve deliberate faults were each caught, among them: a gate dropped from `needs:`, a gate limited to merge requests, an `exit 0` before the evidence, a build job pushing `:<sha>`, `allow_failure: true` on a gate, promotion on `main`, and a compose file back on a tag.
- **Build.** In `docker:28.5.2-cli` against `docker:28.5.2-dind`, the build jobs' digest step recorded exactly the digests the registry holds for the pushed candidates, labels included.
- **Promotion.** `.release/promote.sh` ran in the pinned `regclient/regctl:v0.11.6-alpine` (busybox `ash`). Every release tag then held its candidate's digest. Against a local registry, 37 further checks:
  - a retried promotion changes nothing, and `:staging` never moves back to an older pipeline's release;
  - it refuses missing, failed or foreign evidence, a gate that ran another digest, and a candidate that is missing or labelled with another commit or pipeline;
  - it refuses `main` and merge request pipelines;
  - the registry password appears in no log or file, and is removed from the regctl configuration on exit.

  `shellcheck -s sh` reports nothing.
- **Deploy.** `deploy_staging`'s script ran in `alpine:3.24.2`, with stand-ins for `ssh` and `docker`, and with both `sh` and `bash` as the server's shell: 31 checks. It refuses:
  - a manifest from another pipeline, commit or branch;
  - a tag, or a shell command, in place of a digest;
  - a compose file that names `:staging` or a candidate;
  - a container left on another image, which also leaves `.env` on the previous release.

  `.env` and the image cleanup behave as described above.

**Not verifiable here:** a real pipeline on this GitLab instance. That covers its CI Lint, how its runner expands dotenv variables in `image:` and `services:` names (an unexpanded one fails the job on an empty digest; it cannot pull anything else), its job token permissions, the registry at `cicdtesttwo.nibbank.com.et:5050`, and the staging server. Step 7 of the one-time setup lists what to check in the first real pipelines.
