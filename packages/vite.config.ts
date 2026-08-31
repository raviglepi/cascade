import {defineConfig} from "vite";
import typesugar from "unplugin-typesugar/vite";

export default defineConfig({
  plugins: [typesugar()],
  build: {
    lib: {entry: "src/index.ts", formats: ["es", "cjs"]},
    rollupOptions: {input: "src/index.ts", output: {format: "es", entryFileNames: "index.js"}},
  },
});

// import {resolve} from "node:path"; // oxlint-disable-line effecttsgo/node-builtin-import
// import {Config, ConfigProvider, Effect, Path} from "effect";
// export default Effect.runSync(
//   Effect.gen(function* () {
//     return defineConfig({
//       plugins: [typesugar()],
//       build: {
//         lib: {
//           entry: resolve(
//             (yield* Path.Path).join(
//               import.meta.dir,
//               "packages",
//               yield* Config.string("PACKAGE").parse(ConfigProvider.fromEnv()),
//               "src",
//               "index.ts",
//             ),
//           ),
//           formats: ["es", "cjs"],
//           fileName: format => `${format}/index.js`,
//         },
//         rollupOptions: {input: "src/index.ts", output: {format: "es", entryFileNames: "index.js"}},
//       },
//     });
//   }).pipe(Effect.provide(Path.layer)), // oxlint-disable-line effecttsgo/strict-effect-provide
// );

// export default defineConfig({
//   plugins: [typesugar()],

//   build: {
//     lib: {
//       entry: resolve(import.meta.dir, `packages/${pkg}/src/index.ts`),
//       formats: ["es", "cjs"],
//       fileName: format => `${format}/index.js`,
//     },
//     rollupOptions: {input: "src/index.ts", output: {format: "es", entryFileNames: "index.js"}},
//     // lib: {entry: "src/index.ts", formats: ["es", "cjs"]},
//   },
// });
