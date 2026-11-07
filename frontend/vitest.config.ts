import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests (npm test): src/**/*.spec.ts(x), in Node; no backend or browser
// needed. Component tests opt into a DOM with `// @vitest-environment jsdom`
// and render through src/testing (the app's providers, a stubbed BFF).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
    // Component tests walk through whole pages in jsdom; with every file running
    // in parallel they need more than the default 5 s.
    testTimeout: 30_000,
    // next-auth imports "next/server" without an extension, which Node's ESM
    // resolver refuses; bundling it lets Vite resolve it (BFF route tests).
    server: { deps: { inline: ['next-auth'] } },
    // GitLab shows JUnit results on the merge request (CI is set by GitLab).
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'coverage/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // contract.gen.ts is generated from contracts/openapi.json (api:check
      // keeps it in step). cli/main.ts only starts the CLI, which the lint job
      // runs as its own process (project:check). src/testing is test support.
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/testing/**',
        'src/shared/api/contract.gen.ts',
        'src/cli/main.ts',
      ],
      reportsDirectory: 'coverage',
      // Paths in lcov.info relative to the repository root (frontend/src/...),
      // which is where SonarQube resolves them from.
      reporter: ['text-summary', ['lcov', { projectRoot: '..' }]],
    },
  },
});
