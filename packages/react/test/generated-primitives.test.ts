import type {MouseEvent} from "react";
import {describe, expect, it} from "vitest";

import {Color, Element, Event, Enum, Listener, Size, Style} from "../src/index.ts";
import {getDecoratorMetadata, getElementMetadata} from "../src/primitives.ts";

describe("generated React token families", () => {
  it("retains precise CSS property values", () => {
    const flexWrap = Style.FlexWrap(Enum("wrap"));

    expect(flexWrap.definition).toBe(Style.FlexWrap);
    expect(Style.Padding(Size(12)).definition).toBe(Style.Padding);
    expect(Style.BorderColor(Color("red")).definition).toBe(Style.BorderColor);
    expect(Style.Opacity(0.5).definition).toBe(Style.Opacity);
    expect(Style.Flex("1 0").definition).toBe(Style.Flex);

    // @ts-expect-error `center` is not a valid value for CSS flex-wrap.
    Style.FlexWrap(Enum("center"));
    // @ts-expect-error lengths retain their explicit `Size` boundary.
    Style.Padding(12);
  });

  it("exposes the reflected style and event families", () => {
    const click = Event.OnClick(
      Listener((event: MouseEvent<HTMLElement>) => event.currentTarget.focus()),
    );

    expect(click.definition).toBe(Event.OnClick);
    expect(Style).toHaveProperty("AccentColor");
    expect(Style).toHaveProperty("FlexWrap");
    expect(Event).toHaveProperty("OnClick");
    expect(Event).toHaveProperty("OnPointerDown");
    expect(Object.keys(Style).length).toBeGreaterThan(800);
    expect(Object.keys(Event).length).toBeGreaterThan(100);
    expect(getDecoratorMetadata(Style.FlexWrap)).toMatchObject({
      kind: "style",
      property: "flexWrap",
    });
    expect(getDecoratorMetadata(Event.OnClick)).toMatchObject({kind: "event", property: "onClick"});
  });

  it("keeps semantic values separate from generated tokens", () => {
    expect(Style.Padding).not.toBe(Size);
    expect(Event.OnClick).not.toBe(Listener);
  });

  it("keeps concrete DOM elements separate from future concepts", () => {
    expect(Element.Button().definition).toBe(Element.Button);
    expect(getElementMetadata(Element.Button)).toMatchObject({kind: "element", tag: "button"});
  });
});
