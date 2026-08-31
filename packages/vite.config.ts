import {defineConfig} from "vite";
import typesugar from "unplugin-typesugar/vite";

export default defineConfig({
  plugins: [typesugar()],
  build: {
    lib: {entry: "src/index.ts", formats: ["es", "cjs"]},
    rollupOptions: {input: "src/index.ts", output: {format: "es", entryFileNames: "index.js"}},
  },
});
