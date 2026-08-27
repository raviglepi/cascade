import * as Effect from "effect/Effect";
import {describe, expect, it} from "vitest";
import {Cascade, Not, Token} from "../src/index.ts";

describe("rule engine", () => {
  it("runs on condition entry, not on unrelated changes", () => {
    const Disabled = Token("Disabled")();
    const Color = Token("Color")<string>();
    const Opacity = Token("Opacity")<number>();
    const Button = Token("Button")();
    let runs = 0;
    const cascade = new Cascade().rule(Button(Disabled()), function* (button) {
      runs += 1;
      yield* button.get(Opacity()).pipe(Token.setValue(0.5));
    });
    const runtime = Effect.runSync(cascade.gen());
    const mounted = runtime.mount(Button(Disabled(), Opacity(1)));
    const button = mounted.roots[0];

    expect(button?.get(Opacity).value()).toBe(0.5);
    expect(runs).toBe(1);

    Effect.runSync(button?.pipe(Token.add(Color("red"))) ?? Effect.void);
    expect(runs).toBe(1);

    Effect.runSync(button?.pipe(Token.del(Disabled())) ?? Effect.void);
    Effect.runSync(button?.pipe(Token.add(Disabled())) ?? Effect.void);
    expect(runs).toBe(2);

    mounted.release();
  });

  it("uses Not terms to define disjoint writes", () => {
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
    const runtime = Effect.runSync(cascade.gen());
    const mounted = runtime.mount(Button(Ghost(), Opacity(1)));

    expect(mounted.roots[0]?.get(Opacity).value()).toBe(0.8);
    mounted.release();
  });

  it("reports a failed rule and continues later entries", () => {
    const Active = Token("Active")();
    const Color = Token("Color")<string>();
    const Item = Token("Item")();
    const Touched = Token("Touched")();
    const failures: string[] = [];
    const cascade = new Cascade()
      .rule(Item(Active()), function* (item) {
        yield* item.pipe(Token.add(Touched()));
        throw new Error("broken rule");
      })
      .rule(Item(Active()), function* (item) {
        yield* item.get(Color()).pipe(Token.setValue("green"));
      });
    const runtime = Effect.runSync(cascade.gen());
    runtime.onRuleFailure(failure => failures.push(failure.rule));
    const mounted = runtime.mount(Item(Active(), Color("red")));

    expect(failures).toEqual(["Item.1"]);
    expect(mounted.roots[0]?.get(Color).value()).toBe("green");
    mounted.release();
  });
});
