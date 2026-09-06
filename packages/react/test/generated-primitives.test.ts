import type {MouseEvent} from "react";
import {describe, expect, it} from "vitest";

import {Effect} from "effect";

import {Color, Element, Event, Size, Style} from "../src/index.ts";
import {getDecoratorMetadata, getElementMetadata} from "../src/primitives.ts";

describe("generated React token families", () => {
  it("accepts the native value type of each generated CSS property", () => {
    const flexWrap = Style.FlexWrap("wrap");

    expect(flexWrap.definition).toBe(Style.FlexWrap);
    expect(Style.Padding(Size.Px(12)).definition).toBe(Style.Padding);
    expect(Style.BorderColor(Color.Css({value: "red"})).definition).toBe(Style.BorderColor);
    expect(Style.Background(Color.Rgb({red: 0, green: 0, blue: 0})).definition).toBe(
      Style.Background,
    );
    expect(Style.Opacity(0.5).definition).toBe(Style.Opacity);
    expect(Style.Flex("1 0").definition).toBe(Style.Flex);

    // @ts-expect-error `center` is not a valid value for CSS flex-wrap.
    Style.FlexWrap("center");
    // @ts-expect-error Lengths require a semantic size.
    Style.Padding(12);
    // @ts-expect-error Colours require a semantic colour.
    Style.Color("red");
    // @ts-expect-error Numeric properties do not accept CSS strings.
    Style.Opacity("0.5");
  });

  it("exposes the reflected style and event families", () => {
    const click = Event.OnClick((event: MouseEvent<HTMLElement>) =>
      Effect.sync(() => event.currentTarget.focus()),
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

  it("keeps concrete DOM elements separate from future concepts", () => {
    expect(Element.Button().definition).toBe(Element.Button);
    expect(getElementMetadata(Element.Button)).toMatchObject({kind: "element", tag: "button"});
  });
});
