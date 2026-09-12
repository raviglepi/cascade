import type {CSSProperties, DOMAttributes} from "react";
import {describe, expect, it} from "vitest";
import {comptime} from "comptime";
import {typeInfo} from "typesugar";

const reflectedNames = comptime(() => {
  const styles = typeInfo<CSSProperties>();
  const events = typeInfo<DOMAttributes<HTMLElement>>();
  const elements = typeInfo<HTMLElementTagNameMap>();
  return {
    elements: elements.fields.map(field => field.name),
    events: events.fields.filter(field => field.name.startsWith("on")).map(field => field.name),
    styles: styles.fields.map(field => field.name),
  };
});

describe("compile-time React type information", () => {
  it("returns descriptor names used to generate style tokens", () => {
    expect(reflectedNames.styles).toEqual(expect.arrayContaining(["color", "flexWrap", "opacity"]));
  });

  it("returns descriptor names used to generate event tokens", () => {
    expect(reflectedNames.events).toEqual(expect.arrayContaining(["onClick", "onKeyDown"]));
  });

  it("returns descriptor names used to generate host tokens", () => {
    expect(reflectedNames.elements).toContain("button");
  });
});
