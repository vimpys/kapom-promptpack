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
    // SECURITY.md กฎที่ 1 — มีแค่ secret-guard.ts ที่สร้าง GuardedFile ได้
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
              message: 'markGuarded() เรียกได้เฉพาะใน core/secret-guard.ts — ดู SECURITY.md กฎที่ 1',
            },
            {
              name: '../core/types.js',
              importNames: ['markGuarded'],
              message: 'markGuarded() เรียกได้เฉพาะใน core/secret-guard.ts — ดู SECURITY.md กฎที่ 1',
            },
          ],
        },
      ],
    },
  },
);
