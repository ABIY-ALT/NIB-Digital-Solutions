// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Cross-boundary imports use the package.json "imports" aliases (#core/*, #modules/*, ...).
// Relative paths are only for files close together inside the same module/layer.
const noDeepRelativeImports = {
  regex: String.raw`^(\.\./){2,}`,
  message: 'Use a "#..." subpath import (see package.json "imports") instead of a deep relative path.',
};

const domainRestrictions = {
  patterns: [
    noDeepRelativeImports,
    {
      group: ['@nestjs/*', '@prisma/*', '**/generated/prisma/**', String.raw`\#generated/**`, 'ioredis', 'jose', 'zod', 'express', 'node:*'],
      message: 'Domain layer must not depend on frameworks, ORMs or runtime libraries (principle 5).',
    },
    {
      group: ['**/infrastructure/**', '**/presentation/**', '**/application/**'],
      message: 'Domain layer must not depend on outer layers.',
    },
  ],
};

const applicationRestrictions = {
  patterns: [
    noDeepRelativeImports,
    {
      group: ['@prisma/*', '**/generated/prisma/**', String.raw`\#generated/**`, 'ioredis', 'express'],
      message: 'Application layer depends on ports, never on concrete technology.',
    },
    {
      group: ['**/infrastructure/**', '**/presentation/**'],
      message: 'Application layer must not depend on outer layers.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'eslint.config.mjs', 'scripts/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noDeepRelativeImports] }] },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', domainRestrictions] },
  },
  {
    files: ['src/**/application/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', applicationRestrictions] },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
