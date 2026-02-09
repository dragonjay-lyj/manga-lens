import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      a11y: jsxA11y,
    },
    rules: {
      "a11y/control-has-associated-label": "warn",
      "a11y/label-has-associated-control": [
        "warn",
        {
          assert: "either",
          depth: 3,
        },
      ],
      "a11y/no-static-element-interactions": "warn",
      "a11y/no-noninteractive-element-interactions": "warn",
      "a11y/click-events-have-key-events": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
