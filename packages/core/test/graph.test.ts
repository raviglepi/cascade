import {describe, expect, it} from "@effect/vitest";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SubscriptionRef from "effect/SubscriptionRef";
import {CascadeRuntimeService} from "../src/graph.ts";
import {Cascade, Not, Token} from "../src/index.ts";

describe("owned live graph", () => {
  it.effect("reads relations in both directions and preserves insertion order", () =>
    Effect.gen(function* () {
      const Text = Token("Text")<string>();
      const Name = Token("Name")();
      const User = Token("User")();
      const runtime = yield* new Cascade().gen();
      const mounted = yield* runtime.mount(User(Name(Text("Ada"))));
      const user = mounted.roots[0];
      const name = user?.get(Name);

      expect(user?.tokens().map(token => token.definition.name)).toEqual(["Name"]);
      expect(name?.get(User).id).toBe(user?.id);
      expect(name?.get(Text).value()).toBe("Ada");

      yield* mounted.release;
    }),
  );

  it.effect("applies add, delete, and set as complete observable changes", () =>
    Effect.gen(function* () {
      const Fill = Token("Fill")();
      const Ghost = Token("Ghost")(Not(Fill()));
      const Label = Token("Label")();
      const Button = Token("Button")();
      const runtime = yield* new Cascade().gen();
      const mounted = yield* runtime.mount(Button(Fill(), Label()));
      const button = mounted.roots[0];
      const revision = yield* SubscriptionRef.get(mounted.revision);

      const addGhost = button?.pipe(Token.add(Ghost())) ?? Effect.void;
      yield* addGhost;
      expect(button?.tokens().map(token => token.definition.name)).toEqual(["Label", "Ghost"]);

      const deleteLabel = button?.pipe(Token.del(Label())) ?? Effect.void;
      yield* deleteLabel;
      expect(button?.tokens().map(token => token.definition.name)).toEqual(["Ghost"]);

      const replaceRelations = button?.pipe(Token.set(Label(), Fill())) ?? Effect.void;
      yield* replaceRelations;
      expect(button?.tokens().map(token => token.definition.name)).toEqual(["Label", "Fill"]);
      expect(yield* SubscriptionRef.get(mounted.revision)).toBe(revision + 3);

      yield* mounted.release;
    }),
  );

  it.effect("provides the runtime through the configured layer", () => {
    const Item = Token("Item")();
    const cascade = new Cascade();
    return Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(cascade.layer());
        const runtime = Context.get(context, CascadeRuntimeService);
        const mounted = yield* runtime.mount(Item());
        expect(mounted.roots[0]?.definition).toBe(Item);
        yield* mounted.release;
      }),
    );
  });
});
