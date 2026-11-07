import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7+).
 * The runtime connection is created in PrismaService through the pg driver adapter;
 * this file only drives the CLI (generate, migrate, seed, studio).
 *
 * A DATABASE_URL that is already set wins over .env (dotenv never overrides),
 * which scripts/db-setup.js relies on to point the CLI at another database.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Only migrate / db / studio need a connection string. Leaving the datasource
  // out when DATABASE_URL is unset keeps `prisma generate` (the postinstall
  // hook) working where no database exists: `npm ci` in CI and in the Docker
  // build. prisma env() would throw there instead.
  ...(url ? { datasource: { url } } : {}),
});
