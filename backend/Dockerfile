# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# NestJS (ESM) on Node 24, built in stages so the runtime image carries only
# production dependencies and compiled output.

# ---------------------------------------------------------------------------
# 1. Base for the images that ship (migrate, runner): the official image minus
#    npm, npx, corepack and yarn. Nothing in them runs a package manager, and
#    npm's bundled dependencies (tar, undici, ...) otherwise surface as HIGH
#    findings in the Trivy scan whenever they fall behind a fix. The build
#    stages keep the stock image, npm included.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime-base

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /opt/yarn-v* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# ---------------------------------------------------------------------------
# 2. Full dependency tree (dev deps included) for building.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# The postinstall hook runs `prisma generate`, so the schema and Prisma config
# must already be present when `npm ci` runs.
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

RUN npm ci

# ---------------------------------------------------------------------------
# 3. Compile TypeScript with `nest build`.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client is generated into src/generated, which .dockerignore keeps
# out of the context, and `nest build` compiles it with the rest of src/. No
# database is contacted here: `prisma generate` only reads the schema, and
# prisma.config.ts omits the datasource when DATABASE_URL is unset.
RUN npm run prisma:generate && npm run build

# ---------------------------------------------------------------------------
# 4. One-shot database setup: creates the database if it is missing, then
#    applies pending migrations. Needs the Prisma CLI (a devDependency), so it
#    reuses the full dependency tree. Built only with `--target migrate`; a
#    plain `docker build` still produces the runtime image below.
# ---------------------------------------------------------------------------
FROM runtime-base AS migrate
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts ./scripts

USER node

CMD ["node", "scripts/db-setup.js"]

# ---------------------------------------------------------------------------
# 5. Production-only dependency tree.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./

# --ignore-scripts: the postinstall hook calls the Prisma CLI, a devDependency
#   absent here. The generated client is already compiled into dist/ by the
#   builder stage, so there is nothing to regenerate.
# --omit=optional: @prisma/client declares the Prisma CLI and TypeScript as
#   *optional peer* dependencies, which npm installs even under --omit=dev.
#   Neither is used at runtime.
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# ---------------------------------------------------------------------------
# 6. Runtime image.
# ---------------------------------------------------------------------------
FROM runtime-base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder   --chown=node:node /app/dist ./dist

# package.json carries the "imports" map (#core/*, #modules/*, ...) that the
# compiled code in dist/ resolves at runtime.
COPY --chown=node:node package.json ./

# The operations CLI (node dist/cli/main.js) compares the database with the
# migrations of this release in `db:status`; it reads them from here.
COPY --chown=node:node prisma/migrations ./prisma/migrations

# The retention job archives purged records under ARCHIVE_DIR (default
# storage/archive). WORKDIR belongs to root, so create the directory for the
# node user. Mount a volume here to keep the archives.
RUN mkdir -p storage && chown node:node storage

# `node` (uid 1000) ships with the official image — no useradd needed.
USER node

EXPOSE 4000

# What `npm run start:prod` runs, without the npm wrapper, so Node is PID 1
# and receives SIGTERM directly on `docker stop`.
CMD ["node", "dist/main.js"]
