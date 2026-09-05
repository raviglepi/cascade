import type {RuleFailure} from "../src/index.ts";
import {describe, expect, it} from "@effect/vitest";

import {Cause, Deferred, Effect, Fiber, Stream} from "effect";

import {Cascade, Not, Token} from "../src/index.ts";

const causeOf = (failure: RuleFailure): Cause.Cause<never> => failure.cause;

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
      const runtime = yield* cascade.make();
      const mounted = yield* runtime.mount(Button(Disabled(), Opacity(1)));
      const button = mounted.roots[0]!;

      expect(button.get(Opacity).value()).toBe(0.5);
      expect(runs).toBe(1);

      yield* button.pipe(Token.add(Color("red")));
      expect(runs).toBe(1);

      yield* button.pipe(Token.del(Disabled()));
      yield* button.pipe(Token.add(Disabled()));
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
      const runtime = yield* cascade.make();
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
        const broken = new Error("broken rule");
        const cascade = new Cascade()
          .rule(Item(Active()), function* (item) {
            yield* item.pipe(Token.add(Touched()));
            throw broken;
          })
          .rule(Item(Active()), function* (item) {
            yield* item.get(Color()).pipe(Token.setValue("green"));
          });
        const runtime = yield* cascade.make();
        const reportedFailure = yield* Deferred.make<RuleFailure>();
        const pullFailure = yield* Stream.toPull(runtime.ruleFailures);
        const observer = yield* Effect.forkScoped(
          pullFailure.pipe(
            Effect.flatMap(([failure]) => Deferred.succeed(reportedFailure, failure)),
            Effect.asVoid,
          ),
        );
        yield* Effect.yieldNow;
        const mounted = yield* runtime.mount(Item(Active(), Color("red")));
        const failure = yield* Deferred.await(reportedFailure);
        yield* Fiber.join(observer);

        expect(failure.rule).toBe("Item.1");
        expect(causeOf(failure)).toEqual(Cause.die(broken));
        expect(mounted.roots[0]!.get(Color).value()).toBe("green");
        yield* mounted.release;
      }),
    ),
  );
});
