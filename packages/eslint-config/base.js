import typescriptEslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import simpleImportSort from "eslint-plugin-simple-import-sort";

/** 빌드 산출물·의존성 — 모든 패키지 공통 (#34) */
export const ignores = ["**/node_modules/", "**/dist/", "**/build/", "**/public/", "**/.next/", "**/coverage/"];

/** Next 설정과 공유하는 규칙 — 프레임워크와 무관한 것만 */
export const commonRules = {
  "simple-import-sort/imports": "warn",
  "simple-import-sort/exports": "warn",
  "no-console": "warn",
  eqeqeq: ["error", "smart"],
};

/**
 * Node/TypeScript 패키지(api · chatbot · cafe · player · shared)용 flat config (#34).
 * typescript-eslint recommended 위에 공통 규칙. 테스트·워커의 console 은 파일 단위로 끈다.
 */
export default [
  { ignores },
  {
    name: "wizbot/base",
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...commonRules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
