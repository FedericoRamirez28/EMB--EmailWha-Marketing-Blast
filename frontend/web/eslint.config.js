import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ===== fix Windows absolute path ===== */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },

  // ✅ reglas base para JS
  js.configs.recommended,

  // ✅ 1) Config para archivos JS (NO type-checked, evita el error del eslint.config.js)
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // ✅ 2) Config para TS/TSX con type-check (solo aquí usamos project)
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...c.languageOptions,
      parserOptions: {
        ...c.languageOptions?.parserOptions,
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
    },
  })),

  // ✅ 3) Reglas React (solo TS/TSX)
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
