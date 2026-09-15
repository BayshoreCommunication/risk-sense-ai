import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Authenticated browser-only screens intentionally load API state after mount. Their
    // loading/error transitions are not derived state, so the React 19 blanket rule is not useful here.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e-report/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
