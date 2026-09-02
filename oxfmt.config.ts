import {defineConfig} from "oxfmt";

export default defineConfig({
  arrowParens: "avoid",
  objectWrap: "collapse",
  bracketSameLine: true,
  bracketSpacing: false,
  jsdoc: {
    commentLineStrategy: "singleLine",
    lineWrappingStyle: "balance",
    capitalizeDescriptions: true,
    addDefaultToDescription: true,
  },
  sortImports: {
    newlinesBetween: false,
    customGroups: [
      {groupName: "value-cascade", elementNamePattern: ["cascade"], modifiers: ["value"]},
      {groupName: "type-cascade", elementNamePattern: ["cascade"], modifiers: ["type"]},
      {groupName: "compile", elementNamePattern: ["comptime", "typesugar"]},
      {groupName: "config", elementNamePattern: ["vite", "vitest/config"]},
      {groupName: "test", elementNamePattern: ["vitest"]},
      {groupName: "test-effect", elementNamePattern: ["@effect/vitest"]},

      {
        groupName: "value-effect-libs-wildcard",
        elementNamePattern: ["effect"],
        modifiers: ["value", "wildcard"],
      },
      {
        groupName: "value-effect-libs-external-wildcard",
        elementNamePattern: ["effect-**", "**@effect", "**/effect"],
        modifiers: ["value", "wildcard"],
      },
      {groupName: "value-effect-libs", elementNamePattern: ["effect"], modifiers: ["value"]},
      {
        groupName: "value-effect-libs-external",
        elementNamePattern: ["effect-**", "**@effect", "**/effect"],
        modifiers: ["value"],
      },

      {
        groupName: "type-effect-libs-wildcard",
        elementNamePattern: ["effect"],
        modifiers: ["type", "wildcard"],
      },
      {
        groupName: "type-effect-libs-external-wildcard",
        elementNamePattern: ["effect-**", "**@effect", "**/effect"],
        modifiers: ["type", "wildcard"],
      },
      {groupName: "type-effect-libs", elementNamePattern: ["effect"], modifiers: ["type"]},
      {
        groupName: "type-effect-libs-external",
        elementNamePattern: ["effect-**", "**@effect", "**/effect"],
        modifiers: ["type"],
      },
    ],
    groups: [
      "type-external",

      "type-effect-libs-wildcard",
      "type-effect-libs-external-wildcard",
      "type-effect-libs",
      "type-effect-libs-external",

      "type-cascade",
      "type-internal",
      "type-parent",
      "type-sibling",
      "type-index",

      "test",
      "test-effect",
      "compile",
      "config",

      {newlinesBetween: true},

      "wildcard-builtin",
      "value-builtin",

      "value-effect-libs-wildcard",
      "value-effect-libs-external-wildcard",
      "value-effect-libs",
      "value-effect-libs-external",

      {newlinesBetween: true},

      "value-external",
      "value-cascade",
      "value-internal",
      "value-parent",
      "value-sibling",
      "value-index",

      "unknown",
      "style",
    ],
  },
});
