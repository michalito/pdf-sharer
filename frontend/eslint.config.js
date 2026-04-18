import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist", "dev-dist", "node_modules", "public/sw.js", "public/workbox-*.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Dialogs intentionally autoFocus the first field; ConfirmDialog's focus
      // trap makes it part of a managed flow, not a pitfall.
      "jsx-a11y/no-autofocus": "off",
      // Assertion policy: a <label> is valid if either htmlFor+id or wrapping
      // provides the association. Codebase uses both patterns.
      // `Select` is a custom combobox that exposes its own aria-label; treat
      // it as a control so wrapping labels (visual only) pass the rule.
      "jsx-a11y/label-has-associated-control": [
        "error",
        { assert: "either", controlComponents: ["Select"] },
      ],
    },
  },
  {
    files: ["src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      // vitest's vi.importActual<typeof import("...")>() needs inline type imports.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["*.config.{ts,js,cjs,mjs}", "vite.config.ts", "tailwind.config.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
