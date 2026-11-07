import { defineConfig } from 'vitest/config';

// Unit tests: src/**/*.spec.ts, no database needed (npm test). The API tests
// in test/**/*.e2e-spec.ts have their own config (vitest.e2e.config.ts).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // GitLab shows JUnit results on the merge request (CI is set by GitLab).
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'coverage/junit-unit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points that only start a process. The pipeline runs each of
      // them as its own process, where coverage cannot see it: main.ts in the
      // build job's smoke test (the container must answer /health/live),
      // openapi-export.ts and cli/main.ts in the lint job (contract:check,
      // routes:list --check).
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/openapi-export.ts',
        'src/cli/main.ts',
      ],
      reportsDirectory: 'coverage/unit',
      // Paths in lcov.info relative to the repository root (backend/src/...),
      // which is where SonarQube resolves them from.
      reporter: ['text-summary', ['lcov', { projectRoot: '..' }]],
    },
  },
});
