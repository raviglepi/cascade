import {describe, expect, it} from "vitest";

import * as Result from "effect/Result";
import {Color, Size, Style} from "../src/index.ts";
import {toCssValue} from "../src/semantic-values.ts";

describe("semantic style values", () => {
  it("uses unit-tagged Size values instead of a generic factory", () => {
    expect(Size.Rm(16)).toEqual({_tag: "Rm", value: 16});
    expect(Style.Padding(Size.Rm(16)).definition).toBe(Style.Padding);
    expect(toCssValue(Size.Rm(16))).toBe("16rem");
    expect(toCssValue(Size.Percent(50))).toBe("50%");

    // @ts-expect-error Sizes must come from the semantic scale.
    Style.Padding(12);
  });

  it("keeps the supplied color model and serializes it to CSS", () => {
    const blue = Color.Hsl({alpha: 0.5, hue: 210, lightness: 50, saturation: 100});

    expect(blue).toMatchObject({_tag: "Hsl", hue: 210});
    expect(Color.toCss(blue)).toBe("hsl(210 100% 50% / 0.5)");
  });

  it("converts models for color math without making RGB the stored representation", () => {
    const red = Color.Hsl({hue: 0, lightness: 50, saturation: 100});
    const converted = Color.toRgb(red);

    expect(Result.isSuccess(converted)).toBe(true);
    if (Result.isSuccess(converted)) {
      expect(converted.success).toMatchObject({_tag: "Rgb", blue: 0, green: 0, red: 255});
    }
  });

  it("provides WCAG luminosity and YIQ brightness", () => {
    const white = Color.Rgb({blue: 255, green: 255, red: 255});
    const black = Color.Rgb({blue: 0, green: 0, red: 0});
    const luminosity = Color.luminosity(white);
    const brightness = Color.brightness(black);

    expect(Result.isSuccess(luminosity)).toBe(true);
    expect(Result.isSuccess(brightness)).toBe(true);
    if (Result.isSuccess(luminosity)) expect(luminosity.success).toBeCloseTo(1);
    if (Result.isSuccess(brightness)) expect(brightness.success).toBe(0);
  });

  it("keeps arbitrary CSS colors available while making conversion explicit", () => {
    const customProperty = Color.Css({value: "var(--brand)"});

    expect(Color.toCss(customProperty)).toBe("var(--brand)");
    expect(Result.isFailure(Color.toRgb(customProperty))).toBe(true);
  });
});
