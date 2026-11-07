# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Next.js (UI + BFF) on Node 24, built in stages and served from the
# standalone bundle.

# ---------------------------------------------------------------------------
# 1. Dependencies.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2. Build (requires `output: "standalone"` in next.config.ts).
#
#    No environment is needed: every server-side value (backend URL, secrets)
#    is read and validated at request time, never at build time.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# 3. Runtime image — standalone server only, no npm, no dev dependencies.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

# The base image ships npm, npx, corepack and yarn. server.js needs none of
# them, and npm's bundled dependencies (tar, undici, ...) otherwise surface as
# HIGH findings in the Trivy scan whenever they fall behind a fix.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /opt/yarn-v* /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/public ./public

# .next/standalone carries server.js plus its pruned node_modules;
# .next/static and public/ are not bundled and must be copied alongside it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
