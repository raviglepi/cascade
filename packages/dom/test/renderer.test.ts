import {describe, expect, it} from "vitest";

import {Effect} from "effect";

import {Element, Event, Style, Whuiy} from "whuiy";
import {createDomRenderer} from "../src/index.ts";

describe("DOM renderer", () => {
  it("renders native elements, runs event effects, and disposes its projection", () => {
    const runtime = Effect.runSync(new Whuiy().make());
    const parent = document.createElement("main");
    let clicks = 0;
    const renderer = createDomRenderer({reportError: () => undefined, runtime});

    const rendered = renderer.render(
      parent,
      Element.Div(
        Element.Button(
          Style.Color("navy"),
          Event.OnClick(() => Effect.sync(() => clicks++)),
        ),
      ),
    );

    const button = parent.querySelector("div > button");
    expect(button).toBeInstanceOf(HTMLButtonElement);
    if (!(button instanceof HTMLButtonElement)) throw new Error("Expected a button");
    expect(button.style.color).toBe("navy");

    button.dispatchEvent(new MouseEvent("click", {bubbles: true}));
    expect(clicks).toBe(1);

    rendered.dispose();
    expect(parent.childElementCount).toBe(0);
  });
});
