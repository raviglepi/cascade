import {defineConfig} from "vite";

import {comptime} from "comptime/vite";
import typesugar from "unplugin-typesugar/vite";

export default defineConfig({
  plugins: [
    // `typesugar` must run before `comptime`
    typesugar(),
    comptime(),
  ],
  build: {lib: {entry: "src/index.ts", formats: ["es", "cjs"]}},
});
