import { fixupPluginRules } from "@eslint/compat";
import pluginNext from "@next/eslint-plugin-next";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import _import from "eslint-plugin-import";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default [
  {
    ignores: ["**/node_modules/", "**/dist/", "**/public/", "**/.next/"],
  },
  {
    name: "next",
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@next/next": pluginNext,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "jsx-a11y": pluginJsxA11y,
      "@typescript-eslint": typescriptEslint,
      import: fixupPluginRules(_import),
      "simple-import-sort": simpleImportSort,
      prettier,
    },
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      ...pluginJsxA11y.configs.recommended.rules,
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-uses-react": "off",
      "@next/next/no-img-element": "off",
      "react/hook-use-state": "off",
      "no-console": "warn",
      eqeqeq: ["error", "smart"],
    },
  },
];
