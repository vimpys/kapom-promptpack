import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', 'esbuild.js'],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
      ],
    },
  },
  {
    // src/core holds plain-data business logic and must stay testable on bare
    // node. Reaching for the VS Code API here also breaks Remote SSH, WSL and
    // the web build. Uses the typescript-eslint variant so `import type` is
    // caught too, and so it does not collide with the base rule below.
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vscode',
              allowTypeImports: false,
              message:
                'src/core must not import vscode. Take plain data as input and return plain data; keep VS Code APIs in commands/, providers/ or views/.',
            },
          ],
        },
      ],
    },
  },
  {
    // Only secret-guard.ts may mint a GuardedFile.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ignores: ['src/core/secret-guard.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './types.js',
              importNames: ['markGuarded'],
              message: 'markGuarded() may only be called from core/secret-guard.ts',
            },
            {
              name: '../core/types.js',
              importNames: ['markGuarded'],
              message: 'markGuarded() may only be called from core/secret-guard.ts',
            },
          ],
        },
      ],
    },
  },
);
