import {test, expect} from "bun:test";
import {BunContext} from "@effect/platform-bun"; // oxlint-disable-line

test("'bun test' uses Bun's included test runner, use 'bun run test' instead", () =>
  expect().fail());
