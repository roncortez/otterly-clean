import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Fast Refresh prefiere un componente por archivo. Se permiten los
      // nombres que sí conviene co-locar: el hook junto a su provider y las
      // utilidades junto a los componentes que las usan. Es una advertencia de
      // experiencia de desarrollo, no de corrección.
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useAuth',
            'useConfig',
            'useUploadConfig',
            'homePathForRoles',
            'cx',
            'statusTone',
            'SERVICE_ICONS',
            'SERVICE_LABELS',
          ],
        },
      ],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
  {
    files: ['vite.config.js', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
