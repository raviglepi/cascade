import {defineConfig, configDefaults} from "vitest/config";

import {comptime} from "comptime/vite";
import typesugar from "unplugin-typesugar/vite";

export default defineConfig({
  plugins: [
    // `typesugar` must run before `comptime`
    typesugar({strict: true}),
    comptime(),
  ],
  test: {
    exclude: [...configDefaults.exclude, "bun.test.ts"],
    projects: [{extends: true, test: {environment: "happy-dom", include: ["dom/**/*.test.ts"]}}],
  },
});
