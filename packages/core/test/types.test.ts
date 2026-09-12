import {expect, it} from "vitest";

import {Effect} from "effect";

import {Not, Rule, Rules, Token, Whuiy, type Mount} from "../src/index.ts";

const Fill = Token("Fill")();
const Ghost = Token("Ghost")(Not(Fill()));
const Opacity = Token("Opacity")<number>();
const Button = Token("Button")();

// @ts-expect-error Ghost excludes Fill in the same direct composition.
Button(Ghost(), Fill());

new Whuiy()
  .rule(Button(Ghost()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  })
  // @ts-expect-error These conditions overlap and both write Button/Opacity.value.
  .rule(Button(), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.8));
  });

new Whuiy().extend(
  // @ts-expect-error Rule bundles preserve internal conflicts when extended.
  Rules({
    first: Rule(Button(), function* (button) {
      yield* button.get(Opacity()).pipe(Token.setValue(0.5));
    }),
    second: Rule(Button(), function* (button) {
      yield* button.get(Opacity()).pipe(Token.setValue(0.8));
    }),
  }),
);

const bundledRule = Rules({
  setOpacity: Rule(Button(), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  }),
});

new Whuiy()
  .rule(Button(), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.8));
  })
  // @ts-expect-error Rules preserved through a bundle conflict with an earlier builder rule.
  .extend(bundledRule);

const whuiy = new Whuiy();
const runtime = whuiy.make();
type Runtime = Effect.Success<typeof runtime>;
declare const mount: Mount;

const verifyRetiredApi = (): undefined => {
  // @ts-expect-error The retired runtime builder name is not public.
  whuiy.gen();
  // @ts-expect-error Whuiy no longer exposes a runtime layer.
  whuiy.layer();
  // @ts-expect-error Mount changes are opaque streams rather than SubscriptionRefs.
  return mount.revision;
};
void verifyRetiredApi;

it("keeps the static contract in the TypeScript build", () => {
  expect<Runtime | undefined>(undefined).toBeUndefined();
  expect(true).toBe(true);
});
