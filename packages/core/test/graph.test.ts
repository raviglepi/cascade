import * as Effect from "effect/Effect";
import {describe, expect, it} from "vitest";
import {Cascade, Not, Token} from "../src/index.ts";

describe("owned live graph", () => {
  it("reads relations in both directions and preserves insertion order", () => {
    const Text = Token("Text")<string>();
    const Name = Token("Name")();
    const User = Token("User")();
    const runtime = Effect.runSync(new Cascade().gen());
    const mounted = runtime.mount(User(Name(Text("Ada"))));
    const user = mounted.roots[0];
    const name = user?.get(Name);

    expect(user?.tokens().map(token => token.definition.name)).toEqual(["Name"]);
    expect(name?.get(User).id).toBe(user?.id);
    expect(name?.get(Text).value()).toBe("Ada");

    mounted.release();
  });

  it("applies add, delete, and set as complete observable changes", () => {
    const Fill = Token("Fill")();
    const Ghost = Token("Ghost")(Not(Fill()));
    const Label = Token("Label")();
    const Button = Token("Button")();
    const runtime = Effect.runSync(new Cascade().gen());
    const mounted = runtime.mount(Button(Fill(), Label()));
    const button = mounted.roots[0];
    let notifications = 0;
    const unsubscribe = mounted.subscribe(() => {
      notifications += 1;
    });

    Effect.runSync(button?.pipe(Token.add(Ghost())) ?? Effect.void);
    expect(button?.tokens().map(token => token.definition.name)).toEqual(["Label", "Ghost"]);

    Effect.runSync(button?.pipe(Token.del(Label())) ?? Effect.void);
    expect(button?.tokens().map(token => token.definition.name)).toEqual(["Ghost"]);

    Effect.runSync(button?.pipe(Token.set(Label(), Fill())) ?? Effect.void);
    expect(button?.tokens().map(token => token.definition.name)).toEqual(["Label", "Fill"]);
    expect(notifications).toBe(3);

    unsubscribe();
    mounted.release();
  });
});
