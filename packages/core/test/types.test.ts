import {expect, it} from "vitest";

import {Effect} from "effect";

import {Cascade, Not, Token, type Mount} from "../src/index.ts";

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

const cascade = new Cascade();
const runtime = cascade.make();
type Runtime = Effect.Success<typeof runtime>;
declare const mount: Mount;

const verifyRetiredApi = (): undefined => {
  // @ts-expect-error The retired runtime builder name is not public.
  cascade.gen();
  // @ts-expect-error Cascade no longer exposes a runtime layer.
  cascade.layer();
  // @ts-expect-error Mount changes are opaque streams rather than SubscriptionRefs.
  return mount.revision;
};
void verifyRetiredApi;

it("keeps the static contract in the TypeScript build", () => {
  expect<Runtime | undefined>(undefined).toBeUndefined();
  expect(true).toBe(true);
});
