import {describe, expect, it} from "@effect/vitest";

import {Effect, Stream} from "effect";

import {Cascade, Not, Token, type Mount} from "../src/index.ts";

describe("owned live graph", () => {
  it.effect("reads relations in both directions and preserves insertion order", () =>
    Effect.gen(function* () {
      const Text = Token("Text")<string>();
      const Name = Token("Name")();
      const User = Token("User")();
      const runtime = yield* new Cascade().make();
      const mounted = yield* runtime.mount(User(Name(Text("Ada"))));
      const user = mounted.roots[0]!;
      const name = user.get(Name);

      expect(user.tokens().map(token => token.definition.name)).toEqual(["Name"]);
      expect(name.get(User).id).toBe(user.id);
      expect(name.get(Text).value()).toBe("Ada");

      yield* mounted.release;
    }),
  );

  it.effect("emits an initial change and one change for each completed outer mutation", () =>
    Effect.gen(function* () {
      const Fill = Token("Fill")();
      const Ghost = Token("Ghost")(Not(Fill()));
      const Label = Token("Label")();
      const Button = Token("Button")();
      const runtime = yield* new Cascade().make();
      const mounted: Mount = yield* runtime.mount(Button(Fill(), Label()));
      const button = mounted.roots[0]!;
      const pullChanges = yield* Stream.toPull(mounted.changes);

      yield* pullChanges;

      yield* button.pipe(Token.add(Ghost()));
      yield* pullChanges;
      expect(button.tokens().map(token => token.definition.name)).toEqual(["Label", "Ghost"]);

      yield* button.pipe(Token.del(Label()));
      yield* pullChanges;
      expect(button.tokens().map(token => token.definition.name)).toEqual(["Ghost"]);

      yield* button.pipe(Token.set(Label(), Fill()));
      yield* pullChanges;
      expect(button.tokens().map(token => token.definition.name)).toEqual(["Label", "Fill"]);

      yield* mounted.release;
      yield* mounted.release;
    }),
  );

  it.effect("retains a shared root until every mount releases it", () =>
    Effect.gen(function* () {
      const Label = Token("Label")<string>();
      const Item = Token("Item")();
      const runtime = yield* new Cascade().make();
      const root = Item(Label("retained"));
      const first = yield* runtime.mount(root);
      const second = yield* runtime.mount(root);

      yield* first.release;
      yield* first.release;

      expect(second.roots[0]!.get(Label).value()).toBe("retained");
      yield* second.release;
    }),
  );
});
