import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**", ".wrangler/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": { "attributes": false } }],
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    files: ["**/*.config.{js,ts}", "eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked]
  }
);
