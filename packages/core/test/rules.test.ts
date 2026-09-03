import type {RuleFailure} from "../src/index.ts";
import {describe, expect, it} from "@effect/vitest";

import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import {Cascade, Not, Token} from "../src/index.ts";

describe("rule engine", () => {
  it.effect("runs on condition entry, not on unrelated changes", () =>
    Effect.gen(function* () {
      const Disabled = Token("Disabled")();
      const Color = Token("Color")<string>();
      const Opacity = Token("Opacity")<number>();
      const Button = Token("Button")();
      let runs = 0;
      const cascade = new Cascade().rule(Button(Disabled()), function* (button) {
        runs += 1;
        yield* button.get(Opacity()).pipe(Token.setValue(0.5));
      });
      const runtime = yield* cascade.gen();
      const mounted = yield* runtime.mount(Button(Disabled(), Opacity(1)));
      const button = mounted.roots[0];

      expect(button?.get(Opacity).value()).toBe(0.5);
      expect(runs).toBe(1);

      const addColor = button?.pipe(Token.add(Color("red"))) ?? Effect.void;
      yield* addColor;
      expect(runs).toBe(1);

      const removeDisabled = button?.pipe(Token.del(Disabled())) ?? Effect.void;
      yield* removeDisabled;
      const addDisabled = button?.pipe(Token.add(Disabled())) ?? Effect.void;
      yield* addDisabled;
      expect(runs).toBe(2);

      yield* mounted.release;
    }),
  );

  it.effect("uses Not terms to define disjoint writes", () =>
    Effect.gen(function* () {
      const Disabled = Token("Disabled")();
      const Ghost = Token("Ghost")();
      const Opacity = Token("Opacity")<number>();
      const Button = Token("Button")();

      const cascade = new Cascade()
        .rule(Button(Disabled(), Not(Ghost())), function* (button) {
          yield* button.get(Opacity()).pipe(Token.setValue(0.5));
        })
        .rule(Button(Ghost()), function* (button) {
          yield* button.get(Opacity()).pipe(Token.setValue(0.8));
        });
      const runtime = yield* cascade.gen();
      const mounted = yield* runtime.mount(Button(Ghost(), Opacity(1)));

      expect(mounted.roots[0]?.get(Opacity).value()).toBe(0.8);
      yield* mounted.release;
    }),
  );

  it.effect("reports a failed rule and continues later entries", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const Active = Token("Active")();
        const Color = Token("Color")<string>();
        const Item = Token("Item")();
        const Touched = Token("Touched")();
        const cascade = new Cascade()
          .rule(Item(Active()), function* (item) {
            yield* item.pipe(Token.add(Touched()));
            throw new Error("broken rule");
          })
          .rule(Item(Active()), function* (item) {
            yield* item.get(Color()).pipe(Token.setValue("green"));
          });
        const runtime = yield* cascade.gen();
        const reportedFailure = yield* Deferred.make<RuleFailure>();
        const observer = yield* runtime.ruleFailures.pipe(
          Stream.take(1),
          Stream.runForEach(failure =>
            Effect.andThen(Deferred.succeed(reportedFailure, failure), Effect.void),
          ),
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        const mounted = yield* runtime.mount(Item(Active(), Color("red")));
        const failure = yield* Deferred.await(reportedFailure);
        yield* Fiber.join(observer);

        expect(failure.rule).toBe("Item.1");
        expect(mounted.roots[0]?.get(Color).value()).toBe("green");
        yield* mounted.release;
      }),
    ),
  );
});
