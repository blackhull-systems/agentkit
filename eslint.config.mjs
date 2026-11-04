// Lint rules for this repository: correctness first (typed rules on the source), formatting left to Prettier.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs", globals: globals.node } },
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  prettier,
);
