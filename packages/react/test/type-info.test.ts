import type {CSSProperties, DOMAttributes} from "react";
import {describe, expect, it} from "vitest";
import {comptime} from "comptime";
import {typeInfo} from "typesugar";

import * as Effect from "effect/Effect";
import {FlexWrapValues} from "../src/primitives.ts";
import {TypeInfo, enumInfo} from "../src/type-info.ts";

const cssProperties = typeInfo<CSSProperties>();
const domAttributes = typeInfo<DOMAttributes<HTMLElement>>();
const elementMap = typeInfo<HTMLElementTagNameMap>();

const reflectedFields = comptime(() => ({
  events: domAttributes.fields.filter(field => field.name.startsWith("on")),
  styles: cssProperties.fields.filter(
    field => field.name === "color" || field.name === "flexWrap" || field.name === "opacity",
  ),
}));

describe("compile-time React type information", () => {
  it("retains CSS property names for static token generation", () => {
    expect(reflectedFields.styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: "color"}),
        expect.objectContaining({name: "flexWrap", type: expect.any(String)}),
        expect.objectContaining({name: "opacity"}),
      ]),
    );
  });

  it("retains React event-handler names for static token generation", () => {
    expect(reflectedFields.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: "onClick", type: expect.any(String)}),
        expect.objectContaining({name: "onKeyDown"}),
      ]),
    );
  });

  it("reflects concrete HTMLElement tags for the Element family", () => {
    expect(elementMap.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({name: "button"})]),
    );
  });

  it("normalizes reflected metadata through the TypeInfo effect", () => {
    const info = Effect.runSync(TypeInfo<CSSProperties>(cssProperties));

    expect(info.name).toContain("CSSProperties");
    expect(info.fields.some(field => field.name === "flexWrap")).toBe(true);
  });

  it("turns a reflected finite union tuple into static enum values", () => {
    expect(FlexWrapValues).toEqual(expect.arrayContaining(["nowrap", "wrap", "wrap-reverse"]));
  });

  it("rejects malformed reflected enum fields", () => {
    const malformed = Effect.runSync(
      TypeInfo<readonly ["wrap"]>({fields: [{name: "0", type: "FlexWrap"}], name: "Malformed"}),
    );

    const exit = Effect.runSync(Effect.exit(enumInfo(malformed)));
    expect(exit._tag).toBe("Failure");
  });
});
