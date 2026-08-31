import {defineConfig, configDefaults} from "vitest/config";
import typesugar from "unplugin-typesugar/vite";

export default defineConfig({
  plugins: [typesugar({strict: true})],
  test: {exclude: [...configDefaults.exclude, "bun.test.ts"]},
});
