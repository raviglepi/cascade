import {test, expect} from "bun:test";

test("'bun test' uses Bun's included test runner, use 'bun run test' instead", () =>
  expect().fail());
