import {expect, it} from "vitest";
import {Cascade, Not, Token} from "../src/index.ts";

const Fill = Token("Fill")();
const Ghost = Token("Ghost")(Not(Fill()));
const Opacity = Token("Opacity")<number>();
const Button = Token("Button")();

// @ts-expect-error Ghost excludes Fill in the same direct composition.
Button(Ghost(), Fill());

new Cascade()
  .rule(Button(Ghost()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  })
  // @ts-expect-error These conditions overlap and both write Button/Opacity.value.
  .rule(Button(), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.8));
  });

it("keeps the static contract in the TypeScript build", () => {
  expect(true).toBe(true);
});
