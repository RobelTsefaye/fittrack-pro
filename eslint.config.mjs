import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone design-canvas mockups (host-bridge fragments, not part of
    // the Next.js build) — their cross-file component refs aren't resolvable
    // here and would drown the lint gate in false jsx-no-undef errors.
    "Fitapp/**",
    // Native iOS shell: `npm run sync:native` copies the built web app into
    // ios/App/App/public (git-ignored, minified) and Xcode writes ios/App/build.
    // Generated output, not source — it produced thousands of false findings.
    "ios/**",
  ]),
]);

export default eslintConfig;
