// @ts-check
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/shared/api/contract.gen.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Tokens and sensitive data never go into browser storage.
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='localStorage']", message: 'Do not use localStorage for sensitive data.' },
      ],
    },
  },
  // ── Architecture boundaries (feature-based layering) ─────────────────────
  //   app/ (routes) → features/<x>/{components,hooks,api} → shared/ + infrastructure/
  //   Server-only modules (BFF, backend client, secrets, logger) never reach client code.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^@/(features|app)(/|$)', message: 'shared/ is framework code: it must not depend on features or routes.' },
            { regex: String.raw`^@/infrastructure/(api/backend|api/backend-client|logging|security|config/env)(/|$|\.)`, message: 'shared/ must stay client-safe: no server-only infrastructure.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^@/(features|app|shared/ui|shared/layouts)(/|$)', message: 'infrastructure/ must not depend on features, routes or UI.' }] },
      ],
    },
  },
  {
    files: ['src/features/*/components/**/*.{ts,tsx}', 'src/features/*/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: String.raw`(^@/features/[^/]+/|^(\.\.?/)+)api(/|$)`, message: 'Client code must not import a feature\'s server-only api/ modules — call a feature hook (→ /api/…). Shared types belong in the feature\'s types.ts.' },
            { regex: String.raw`^@/infrastructure/(api/backend|api/backend-client|logging|security|config/env)(/|$|\.)`, message: 'Server-only infrastructure must not be imported by client code.' },
          ],
        },
      ],
    },
  },
  {
    // Components never call APIs directly — they use feature hooks.
    files: ['src/components/**/*.tsx', 'src/features/**/components/**/*.tsx', 'src/app/**/page.tsx'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use a feature hook instead of fetch in components.' }],
    },
  },
);
