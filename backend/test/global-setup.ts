import { execFileSync } from 'node:child_process';

/**
 * Runs once before the API tests: checks DATABASE_URL points at a throwaway
 * database, creates it and applies every migration with the same script the
 * migrate container runs on deploy, then loads the development seed (the
 * permission catalogue, the standard roles and the demo users the tests sign
 * in with).
 */
export default function setup(): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set. The API tests need a throwaway PostgreSQL database.');
  }

  const database = decodeURIComponent(new URL(url).pathname.slice(1));

  // The tests write rows, and the audit trail is append-only, so never let
  // them near a shared database.
  if (!/_(test|ci|e2e)$/.test(database)) {
    throw new Error(
      `Refusing to run the API tests against database "${database}". ` +
        'Point DATABASE_URL at a throwaway database whose name ends in _test, _ci or _e2e.',
    );
  }

  execFileSync(process.execPath, ['scripts/db-setup.js'], { stdio: 'inherit' });

  // tsx through node, like the workspace CLI: no npx and no shell.
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
    stdio: 'inherit',
  });
}
