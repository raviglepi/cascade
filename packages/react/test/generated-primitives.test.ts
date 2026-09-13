import {describe, expect, it} from "vitest";

import {Effect} from "effect";

import {Element, Event, Style} from "whuiy";

describe("generated React token families", () => {
  it("accepts each generated CSS property's CSS-compatible value", () => {
    const flexWrap = Style.FlexWrap("wrap");

    expect(flexWrap.definition).toBe(Style.FlexWrap);
    expect(Style.Height(12).definition).toBe(Style.Height);
    expect(Style.Height("calc(100% - 1rem)").definition).toBe(Style.Height);
    expect(Style.Padding(12).definition).toBe(Style.Padding);
    expect(Style.Color("red").definition).toBe(Style.Color);
    expect(Style.Opacity("0.5").definition).toBe(Style.Opacity);
  });

  it("exposes the reflected style and event families", () => {
    const click = Event.OnClick(event =>
      Effect.sync(() => {
        if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
      }),
    );

    expect(click.definition).toBe(Event.OnClick);
    expect(Style).toHaveProperty("AccentColor");
    expect(Style).toHaveProperty("FlexWrap");
    expect(Event).toHaveProperty("OnClick");
    expect(Event).toHaveProperty("OnPointerDown");
    expect(Object.keys(Style).length).toBeGreaterThan(800);
    expect(Object.keys(Event).length).toBeGreaterThan(100);
  });

  it("keeps concrete DOM elements separate from future concepts", () => {
    expect(Element.Button().definition).toBe(Element.Button);
  });
});
