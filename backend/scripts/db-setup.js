// Creates the application database when it does not exist yet, then applies
// pending Prisma migrations. Safe to run on every deploy: both steps are
// no-ops once the database is up to date.
//
//   node scripts/db-setup.js                 # ambient env (containers)
//   node scripts/db-setup.js .env            # npm run db:setup
//   node scripts/db-setup.js .env.staging    # npm run db:setup:staging
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backendRoot = fileURLToPath(new URL('..', import.meta.url));

const envFile = process.argv[2];
if (envFile) {
  // Loaded before prisma.config.ts runs. Neither loadEnvFile nor dotenv
  // overrides a variable that is already set, so this file wins over .env.
  process.loadEnvFile(path.resolve(backendRoot, envFile));
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

try {
  await ensureDatabase(databaseUrl);
} catch (error) {
  console.error(`Could not create the database: ${error.message}`);
  process.exit(1);
}

process.exit(migrate());

async function ensureDatabase(url) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));

  // CREATE DATABASE cannot run inside the database being created, so connect
  // to the "postgres" maintenance database every server ships with. The
  // ?schema= parameter is Prisma's, not libpq's, so it is dropped here.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';

  const client = new pg.Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );

    if (rowCount > 0) {
      console.log(`Database "${name}" already exists on ${target.host}.`);
      return;
    }

    await client.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
    console.log(`Created database "${name}" on ${target.host}.`);
  } catch (error) {
    // 42P04 duplicate_database: another run created it after our check.
    if (error.code !== '42P04') throw error;
  } finally {
    await client.end();
  }
}

function migrate() {
  // Run the CLI with the current Node binary: no npx and no shell, so it
  // behaves the same on Windows and in the Alpine image.
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('prisma/package.json');
  const prismaPackage = require('prisma/package.json');
  const cli = path.join(path.dirname(manifest), prismaPackage.bin.prisma);

  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: backendRoot,
    stdio: 'inherit',
  });

  return result.status ?? 1;
}
