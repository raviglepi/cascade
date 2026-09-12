import {defineConfig, type CustomGroupItemConfig} from "oxfmt";

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
      {groupName: "value-whuiy", elementNamePattern: ["whuiy"], modifiers: ["value"]},
      {groupName: "type-whuiy", elementNamePattern: ["whuiy"], modifiers: ["type"]},
      {groupName: "compile", elementNamePattern: ["comptime", "typesugar"]},
      {groupName: "config", elementNamePattern: ["vite", "vitest/config"]},
      {groupName: "test", elementNamePattern: ["vitest"]},
      {groupName: "test-effect", elementNamePattern: ["@effect/vitest"]},

      ...((elementNamePattern): CustomGroupItemConfig[] => [
        {
          groupName: "value-effect-libs-wildcard",
          elementNamePattern,
          modifiers: ["value", "wildcard"],
        },
        {groupName: "value-effect-libs", elementNamePattern, modifiers: ["value"]},
        {
          groupName: "type-effect-libs-wildcard",
          elementNamePattern,
          modifiers: ["type", "wildcard"],
        },
        {groupName: "type-effect-libs", elementNamePattern, modifiers: ["type"]},
      ])(["effect", "effect/**", "@effect/**"]),
      ...((elementNamePattern): CustomGroupItemConfig[] => [
        {
          groupName: "value-effect-libs-external-wildcard",
          elementNamePattern,
          modifiers: ["value", "wildcard"],
        },
        {groupName: "value-effect-libs-external", elementNamePattern, modifiers: ["value"]},

        {
          groupName: "type-effect-libs-external-wildcard",
          elementNamePattern,
          modifiers: ["type", "wildcard"],
        },
        {groupName: "type-effect-libs-external", elementNamePattern, modifiers: ["type"]},
      ])(["effect-**", "**@effect", "**/effect"]),
    ],
    groups: [
      "type-external",

      "type-effect-libs-wildcard",
      "type-effect-libs-external-wildcard",
      "type-effect-libs",
      "type-effect-libs-external",

      "type-whuiy",
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
      "value-whuiy",
      "value-internal",
      "value-parent",
      "value-sibling",
      "value-index",

      "unknown",
      "style",
    ],
  },
});
