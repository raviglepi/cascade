import {describe, expect, it} from "@effect/vitest";

import {Effect} from "effect";

import {Alias, Cascade, Not, Token} from "../src/index.ts";

describe("token descriptions", () => {
  it("creates fresh default relations for every instance", () => {
    const Text = Token("Text")<string>();
    const Name = Token("Name")(Text("default"));

    const first = Name();
    const second = Name();

    expect(first.id).not.toBe(second.id);
    const firstText = first.tokens()[0]!;
    const secondText = second.tokens()[0]!;
    expect(firstText.id).not.toBe(secondText.id);
    expect(firstText.value()).toBe("default");
  });

  it("lets the last incompatible relation win", () => {
    const Fill = Token("Fill")();
    const Ghost = Token("Ghost")(Not(Fill()));
    const Button = Token("Button")();

    // @ts-expect-error This intentionally exercises runtime normalization of unsafe input.
    const ghostWins = Button(Fill(), Ghost());
    // @ts-expect-error This intentionally exercises runtime normalization of unsafe input.
    const fillWins = Button(Ghost(), Fill());

    expect(ghostWins.tokens().map(token => token.definition.name)).toEqual(["Ghost"]);
    expect(fillWins.tokens().map(token => token.definition.name)).toEqual(["Fill"]);
  });

  it("keeps aliases out of the graph and expands a fresh composition", () => {
    const Ghost = Token("Ghost")();
    const Button = Token("Button")();
    const GhostButton = Alias(Button(Ghost()));
    const Panel = Token("Panel")();

    const first = Panel(GhostButton).tokens()[0]!;
    const second = Panel(GhostButton).tokens()[0]!;

    expect(first.definition).toBe(Button);
    expect(first.id).not.toBe(second.id);
    expect(first.tokens()[0]!.definition).toBe(Ghost);
  });

  it("supports the compact generic value declaration", () => {
    const Text = Token<string>("Text")();
    expect(Text("hello").value()).toBe("hello");
  });

  it.effect("preserves an explicitly supplied undefined value", () =>
    Effect.gen(function* () {
      const Maybe = Token("Maybe")<undefined>();
      const runtime = yield* new Cascade().make();
      const mounted = yield* runtime.mount(Maybe(undefined));
      const maybe = mounted.roots[0]!;

      expect(maybe.hasValue()).toBe(true);
      expect(maybe.value()).toBeUndefined();

      yield* mounted.release;
    }),
  );
});
