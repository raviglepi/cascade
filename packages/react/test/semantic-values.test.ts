import {describe, expect, it} from "vitest";

import * as Result from "effect/Result";

import {Color, Size, Style} from "../src/index.ts";
import {toCssValue} from "../src/semantic-values.ts";

describe("semantic style values", () => {
  it("preserves a finite unit-tagged size and serializes it", () => {
    expect(Size.Rem(1.5)).toEqual({_tag: "Rem", value: 1.5});
    expect(toCssValue(Size.Percent(50))).toBe("50%");
    expect(Style.Padding(Size.Px(12)).definition).toBe(Style.Padding);
    expect(() => Size.Px(Number.NaN)).toThrow();
  });

  it("keeps supported colour models and makes CSS conversion explicit", () => {
    const blue = Color.Hsl({hue: 210, saturation: 100, lightness: 50, alpha: 0.5});

    expect(Color.toCss(blue)).toBe("hsl(210 100% 50% / 0.5)");
    const rgb = Color.toRgb(blue);
    expect(Result.isSuccess(rgb)).toBe(true);
    if (Result.isSuccess(rgb)) expect(rgb.success).toMatchObject({blue: 255, green: 127.5, red: 0});
    expect(Result.isFailure(Color.toRgb(Color.Css({value: "var(--brand)"})))).toBe(true);
  });
});
