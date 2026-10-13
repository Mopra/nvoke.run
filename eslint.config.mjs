import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Tailwind palette colors and hex literals are banned in the desktop and site UI.
// Components use shadcn theme tokens (bg-background, text-muted-foreground,
// border-border, ring-ring and so on) so a theme can be swapped in one file.
const PALETTE =
  '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)';
const UTILITY =
  '(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|shadow|accent|caret|decoration)';
const paletteClass = `${UTILITY}-${PALETTE}([-][0-9]+)?([^a-zA-Z0-9-]|$)`;
const hexColor = '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?([^0-9a-zA-Z]|$)';
const tokenMessage =
  'Use shadcn theme tokens (bg-background, text-foreground, border-border...) instead of palette colors or hex values.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'apps/site/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${paletteClass}/]`, message: tokenMessage },
        { selector: `TemplateElement[value.raw=/${paletteClass}/]`, message: tokenMessage },
        { selector: `Literal[value=/${hexColor}/]`, message: tokenMessage },
        { selector: `TemplateElement[value.raw=/${hexColor}/]`, message: tokenMessage },
      ],
    },
  },
);
