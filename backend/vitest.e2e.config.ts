import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// API tests: test/**/*.e2e-spec.ts boot the whole Nest app against a real
// PostgreSQL (npm run test:e2e). test/global-setup.ts first applies every
// migration and loads the development seed, and refuses to run unless
// DATABASE_URL names a throwaway database: one whose name ends in _test, _ci
// or _e2e.
//
// NestJS resolves constructor dependencies from TypeScript's decorator
// metadata, which Vitest's default compiler (esbuild) does not emit. SWC does;
// unplugin-swc reads experimentalDecorators and emitDecoratorMetadata from
// tsconfig.json. The unit tests build their classes by hand and do not need it.
//
// Standalone rather than mergeConfig(vitest.config.ts): mergeConfig
// concatenates arrays, which would pull the unit tests in here too.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    // One app and one database: run the files one after another.
    fileParallelism: false,
    // The request log of every call would bury the test report. Run with
    // LOG_LEVEL=debug to see it while looking into a failure.
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent', LOG_PRETTY: 'false' },
    // Booting the app and hashing passwords (argon2) take longer than a unit test.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'coverage/junit-e2e.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // See vitest.config.ts for why the entry points are left out.
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/openapi-export.ts',
        'src/cli/main.ts',
      ],
      reportsDirectory: 'coverage/e2e',
      reporter: ['text-summary', ['lcov', { projectRoot: '..' }]],
    },
  },
});
