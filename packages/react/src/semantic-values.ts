import type * as React from "react";

import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

/** @since 0.1.0 */
export type Size = Data.TaggedEnum<{
  readonly Rm: {readonly value: number};
  readonly Px: {readonly value: number};
  readonly Em: {readonly value: number};
  readonly Percent: {readonly value: number};
  readonly Vh: {readonly value: number};
  readonly Vw: {readonly value: number};
  readonly Ch: {readonly value: number};
  readonly Css: {readonly value: string};
}>;

const size = Data.taggedEnum<Size>();
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/** @since 0.1.0 */
export const Size = {
  ...size,
  Rm: (value: number): Size => size.Rm({value: finite(value)}),
  Rem: (value: number): Size => size.Rm({value: finite(value)}),
  Px: (value: number): Size => size.Px({value: finite(value)}),
  Em: (value: number): Size => size.Em({value: finite(value)}),
  Percent: (value: number): Size => size.Percent({value: finite(value)}),
  Vh: (value: number): Size => size.Vh({value: finite(value)}),
  Vw: (value: number): Size => size.Vw({value: finite(value)}),
  Ch: (value: number): Size => size.Ch({value: finite(value)}),
  Css: (value: string): Size => size.Css({value}),
};

/** @since 0.1.0 */
export type Color = Data.TaggedEnum<{
  readonly Rgb: {
    readonly alpha: number;
    readonly blue: number;
    readonly green: number;
    readonly red: number;
  };
  readonly Hsl: {
    readonly alpha: number;
    readonly hue: number;
    readonly lightness: number;
    readonly saturation: number;
  };
  readonly Hsv: {
    readonly alpha: number;
    readonly hue: number;
    readonly saturation: number;
    readonly value: number;
  };
  readonly Hwb: {
    readonly alpha: number;
    readonly blackness: number;
    readonly hue: number;
    readonly whiteness: number;
  };
  readonly Cmyk: {
    readonly alpha: number;
    readonly black: number;
    readonly cyan: number;
    readonly magenta: number;
    readonly yellow: number;
  };
  readonly Xyz: {
    readonly alpha: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly Lab: {
    readonly a: number;
    readonly alpha: number;
    readonly b: number;
    readonly lightness: number;
  };
  readonly Lch: {
    readonly alpha: number;
    readonly chroma: number;
    readonly hue: number;
    readonly lightness: number;
  };
  readonly Css: {readonly value: string};
}>;

type RgbColor = Extract<Color, {readonly _tag: "Rgb"}>;
type HslColor = Extract<Color, {readonly _tag: "Hsl"}>;
type HsvColor = Extract<Color, {readonly _tag: "Hsv"}>;
type HwbColor = Extract<Color, {readonly _tag: "Hwb"}>;
type CmykColor = Extract<Color, {readonly _tag: "Cmyk"}>;
type XyzColor = Extract<Color, {readonly _tag: "Xyz"}>;
type LabColor = Extract<Color, {readonly _tag: "Lab"}>;
type LchColor = Extract<Color, {readonly _tag: "Lch"}>;
type CssColor = Extract<Color, {readonly _tag: "Css"}>;

/** @since 0.1.0 */
export type ColorError = {readonly _tag: "ColorError"; readonly message: string};

type AlphaInput = {readonly alpha?: number};
type RgbInput = AlphaInput & {readonly blue: number; readonly green: number; readonly red: number};
type HslInput = AlphaInput & {
  readonly hue: number;
  readonly lightness: number;
  readonly saturation: number;
};
type HsvInput = AlphaInput & {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
};
type HwbInput = AlphaInput & {
  readonly blackness: number;
  readonly hue: number;
  readonly whiteness: number;
};
type CmykInput = AlphaInput & {
  readonly black: number;
  readonly cyan: number;
  readonly magenta: number;
  readonly yellow: number;
};
type XyzInput = AlphaInput & {readonly x: number; readonly y: number; readonly z: number};
type LabInput = AlphaInput & {readonly a: number; readonly b: number; readonly lightness: number};
type LchInput = AlphaInput & {
  readonly chroma: number;
  readonly hue: number;
  readonly lightness: number;
};

const color = Data.taggedEnum<Color>();

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : minimum, minimum), maximum);

const percentage = (value: number): number => clamp(value, 0, 100);
const alpha = (value: number | undefined): number => clamp(value ?? 1, 0, 1);
const hue = (value: number): number => (((Number.isFinite(value) ? value : 0) % 360) + 360) % 360;
const rounded = (value: number): string => String(Math.round(value * 10_000) / 10_000);

const rgb = (input: RgbInput): RgbColor =>
  color.Rgb({
    alpha: alpha(input.alpha),
    blue: clamp(input.blue, 0, 255),
    green: clamp(input.green, 0, 255),
    red: clamp(input.red, 0, 255),
  });
const hsl = (input: HslInput): HslColor =>
  color.Hsl({
    alpha: alpha(input.alpha),
    hue: hue(input.hue),
    lightness: percentage(input.lightness),
    saturation: percentage(input.saturation),
  });
const hsv = (input: HsvInput): HsvColor =>
  color.Hsv({
    alpha: alpha(input.alpha),
    hue: hue(input.hue),
    saturation: percentage(input.saturation),
    value: percentage(input.value),
  });
const hwb = (input: HwbInput): HwbColor =>
  color.Hwb({
    alpha: alpha(input.alpha),
    blackness: percentage(input.blackness),
    hue: hue(input.hue),
    whiteness: percentage(input.whiteness),
  });
const cmyk = (input: CmykInput): CmykColor =>
  color.Cmyk({
    alpha: alpha(input.alpha),
    black: percentage(input.black),
    cyan: percentage(input.cyan),
    magenta: percentage(input.magenta),
    yellow: percentage(input.yellow),
  });
const xyz = (input: XyzInput): XyzColor =>
  color.Xyz({
    alpha: alpha(input.alpha),
    x: Math.max(Number.isFinite(input.x) ? input.x : 0, 0),
    y: Math.max(Number.isFinite(input.y) ? input.y : 0, 0),
    z: Math.max(Number.isFinite(input.z) ? input.z : 0, 0),
  });
const lab = (input: LabInput): LabColor =>
  color.Lab({
    a: Number.isFinite(input.a) ? input.a : 0,
    alpha: alpha(input.alpha),
    b: Number.isFinite(input.b) ? input.b : 0,
    lightness: percentage(input.lightness),
  });
const lch = (input: LchInput): LchColor =>
  color.Lch({
    alpha: alpha(input.alpha),
    chroma: Math.max(Number.isFinite(input.chroma) ? input.chroma : 0, 0),
    hue: hue(input.hue),
    lightness: percentage(input.lightness),
  });
const css = (input: {readonly value: string}): CssColor => color.Css({value: input.value});

const hueToRgb = (first: number, second: number, hueValue: number): number => {
  const value = ((hueValue % 1) + 1) % 1;
  if (value * 6 < 1) return first + (second - first) * 6 * value;
  if (value * 2 < 1) return second;
  if (value * 3 < 2) return first + (second - first) * (2 / 3 - value) * 6;
  return first;
};

const hslToRgb = (input: HslColor): RgbColor => {
  const saturation = input.saturation / 100;
  const lightness = input.lightness / 100;
  if (saturation === 0) {
    const value = lightness * 255;
    return rgb({alpha: input.alpha, blue: value, green: value, red: value});
  }
  const second =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const first = 2 * lightness - second;
  const hueValue = input.hue / 360;
  return rgb({
    alpha: input.alpha,
    blue: hueToRgb(first, second, hueValue - 1 / 3) * 255,
    green: hueToRgb(first, second, hueValue) * 255,
    red: hueToRgb(first, second, hueValue + 1 / 3) * 255,
  });
};

const hsvToRgb = (input: HsvColor): RgbColor => {
  const chroma = (input.value / 100) * (input.saturation / 100);
  const segment = input.hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = input.value / 100 - chroma;
  return rgb({
    alpha: input.alpha,
    blue: (blue + match) * 255,
    green: (green + match) * 255,
    red: (red + match) * 255,
  });
};

const hwbToRgb = (input: HwbColor): RgbColor => {
  const whiteness = input.whiteness / 100;
  const blackness = input.blackness / 100;
  if (whiteness + blackness >= 1) {
    const value = (whiteness / (whiteness + blackness)) * 255;
    return rgb({alpha: input.alpha, blue: value, green: value, red: value});
  }
  const base = hsvToRgb(
    color.Hsv({alpha: input.alpha, hue: input.hue, saturation: 100, value: 100}),
  );
  if (base._tag !== "Rgb") return base;
  const factor = 1 - whiteness - blackness;
  return rgb({
    alpha: input.alpha,
    blue: base.blue * factor + whiteness * 255,
    green: base.green * factor + whiteness * 255,
    red: base.red * factor + whiteness * 255,
  });
};

const cmykToRgb = (input: CmykColor): RgbColor =>
  rgb({
    alpha: input.alpha,
    blue: 255 * (1 - input.yellow / 100) * (1 - input.black / 100),
    green: 255 * (1 - input.magenta / 100) * (1 - input.black / 100),
    red: 255 * (1 - input.cyan / 100) * (1 - input.black / 100),
  });

const xyzToRgb = (input: XyzColor): RgbColor => {
  const x = input.x / 100;
  const y = input.y / 100;
  const z = input.z / 100;
  const encode = (value: number): number =>
    (value > 0.003_130_8 ? 1.055 * value ** (1 / 2.4) - 0.055 : 12.92 * value) * 255;
  return rgb({
    alpha: input.alpha,
    blue: encode(x * 0.0557 + y * -0.204 + z * 1.057),
    green: encode(x * -0.9693 + y * 1.876 + z * 0.0416),
    red: encode(x * 3.2406 + y * -1.5372 + z * -0.4986),
  });
};

const labToXyz = (input: LabColor): XyzColor => {
  const pivot = (value: number): number =>
    value ** 3 > 0.008_856 ? value ** 3 : (value - 16 / 116) / 7.787;
  const y = (input.lightness + 16) / 116;
  const x = input.a / 500 + y;
  const z = y - input.b / 200;
  return xyz({alpha: input.alpha, x: 95.047 * pivot(x), y: 100 * pivot(y), z: 108.883 * pivot(z)});
};

const lchToLab = (input: LchColor): LabColor => {
  const angle = (input.hue * Math.PI) / 180;
  return lab({
    a: input.chroma * Math.cos(angle),
    alpha: input.alpha,
    b: input.chroma * Math.sin(angle),
    lightness: input.lightness,
  });
};

const rgbValue = (
  input: Color,
): Result.Result<Extract<Color, {readonly _tag: "Rgb"}>, ColorError> => {
  if (input._tag === "Rgb") return Result.succeed(input);
  if (input._tag === "Hsl") return Result.succeed(hslToRgb(input));
  if (input._tag === "Hsv") return Result.succeed(hsvToRgb(input));
  if (input._tag === "Hwb") return Result.succeed(hwbToRgb(input));
  if (input._tag === "Cmyk") return Result.succeed(cmykToRgb(input));
  if (input._tag === "Xyz") return Result.succeed(xyzToRgb(input));
  if (input._tag === "Lab") return Result.succeed(xyzToRgb(labToXyz(input)));
  if (input._tag === "Lch") return Result.succeed(xyzToRgb(labToXyz(lchToLab(input))));
  return Result.fail({
    _tag: "ColorError",
    message: "An opaque CSS color cannot be converted without a CSS parser",
  });
};

const hslValue = (
  input: Color,
): Result.Result<Extract<Color, {readonly _tag: "Hsl"}>, ColorError> => {
  if (input._tag === "Hsl") return Result.succeed(input);
  return Result.map(rgbValue(input), value => {
    const red = value.red / 255;
    const green = value.green / 255;
    const blue = value.blue / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    const delta = maximum - minimum;
    if (delta === 0)
      return hsl({alpha: value.alpha, hue: 0, lightness: lightness * 100, saturation: 0});
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    const hueValue =
      maximum === red
        ? 60 * (((green - blue) / delta) % 6)
        : maximum === green
          ? 60 * ((blue - red) / delta + 2)
          : 60 * ((red - green) / delta + 4);
    return hsl({
      alpha: value.alpha,
      hue: hueValue,
      lightness: lightness * 100,
      saturation: saturation * 100,
    });
  });
};

const toCss = (input: Color): string => {
  if (input._tag === "Css") return input.value;
  if (input._tag === "Rgb")
    return `rgb(${rounded(input.red)} ${rounded(input.green)} ${rounded(input.blue)} / ${rounded(input.alpha)})`;
  if (input._tag === "Hsl")
    return `hsl(${rounded(input.hue)} ${rounded(input.saturation)}% ${rounded(input.lightness)}% / ${rounded(input.alpha)})`;
  if (input._tag === "Hwb")
    return `hwb(${rounded(input.hue)} ${rounded(input.whiteness)}% ${rounded(input.blackness)}% / ${rounded(input.alpha)})`;
  if (input._tag === "Hsv") return toCss(hsvToRgb(input));
  if (input._tag === "Cmyk") return toCss(cmykToRgb(input));
  if (input._tag === "Xyz") return toCss(xyzToRgb(input));
  if (input._tag === "Lab") return toCss(xyzToRgb(labToXyz(input)));
  return toCss(xyzToRgb(labToXyz(lchToLab(input))));
};

const luminosity = (input: Color): Result.Result<number, ColorError> =>
  Result.map(rgbValue(input), value => {
    const linear = (channel: number): number => {
      const normalized = channel / 255;
      return normalized <= 0.039_28 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(value.red) + 0.7152 * linear(value.green) + 0.0722 * linear(value.blue);
  });

const brightness = (input: Color): Result.Result<number, ColorError> =>
  Result.map(
    rgbValue(input),
    value => (299 * value.red + 587 * value.green + 114 * value.blue) / 1000,
  );

const contrast = (first: Color, second: Color): Result.Result<number, ColorError> =>
  Result.flatMap(luminosity(first), firstLuminosity =>
    Result.map(
      luminosity(second),
      secondLuminosity =>
        (Math.max(firstLuminosity, secondLuminosity) + 0.05) /
        (Math.min(firstLuminosity, secondLuminosity) + 0.05),
    ),
  );

const withAlpha = (input: Color, value: number): Color => {
  if (input._tag === "Rgb") return rgb({...input, alpha: value});
  if (input._tag === "Hsl") return hsl({...input, alpha: value});
  if (input._tag === "Hsv") return hsv({...input, alpha: value});
  if (input._tag === "Hwb") return hwb({...input, alpha: value});
  if (input._tag === "Cmyk") return cmyk({...input, alpha: value});
  if (input._tag === "Xyz") return xyz({...input, alpha: value});
  if (input._tag === "Lab") return lab({...input, alpha: value});
  if (input._tag === "Lch") return lch({...input, alpha: value});
  return css(input);
};

const fade = (input: Color, amount: number): Color => withAlpha(input, amount);
const opaquer = (input: Color, amount: number): Color =>
  withAlpha(input, alpha((input._tag === "Css" ? 1 : input.alpha) + amount));
const adjustHsl = (
  input: Color,
  adjustment: (value: Extract<Color, {readonly _tag: "Hsl"}>) => Color,
): Result.Result<Color, ColorError> => Result.map(hslValue(input), adjustment);
const lighten = (input: Color, amount: number): Result.Result<Color, ColorError> =>
  adjustHsl(input, value => hsl({...value, lightness: value.lightness + amount * 100}));
const darken = (input: Color, amount: number): Result.Result<Color, ColorError> =>
  lighten(input, -amount);
const saturate = (input: Color, amount: number): Result.Result<Color, ColorError> =>
  adjustHsl(input, value => hsl({...value, saturation: value.saturation + amount * 100}));
const desaturate = (input: Color, amount: number): Result.Result<Color, ColorError> =>
  saturate(input, -amount);
const grayscale = (input: Color): Result.Result<Color, ColorError> =>
  adjustHsl(input, value => hsl({...value, saturation: 0}));

/** @since 0.1.0 */
export const Color = {
  ...color,
  Rgb: rgb,
  Hsl: hsl,
  Hsv: hsv,
  Hwb: hwb,
  Cmyk: cmyk,
  Xyz: xyz,
  Lab: lab,
  Lch: lch,
  Css: css,
  toRgb: rgbValue,
  toHsl: hslValue,
  toCss,
  luminosity,
  brightness,
  contrast,
  fade,
  opaquer,
  lighten,
  darken,
  saturate,
  desaturate,
  grayscale,
};

/** @internal */
export type Enum<Value extends string> = Data.TaggedEnum<{readonly Enum: {readonly value: Value}}>;
/** @internal */
export const Enum = <Value extends string>(value: Value): Enum<Value> => ({_tag: "Enum", value});
/** @internal */
export type Listener<Handler> = Data.TaggedEnum<{readonly Listener: {readonly handle: Handler}}>;
/** @internal */
export const Listener = <Handler>(handle: Handler): Listener<Handler> => ({
  _tag: "Listener",
  handle,
});
/** @internal */
export function unwrapListener<Handler>(listener: Listener<Handler>): Handler {
  return listener.handle;
}

const channel = Schema.Finite;
const alphaSchema = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 1}));
const percentageSchema = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 100}));
/** @internal */
export const ColorSchema = Schema.TaggedUnion({
  Rgb: {alpha: alphaSchema, blue: channel, green: channel, red: channel},
  Hsl: {
    alpha: alphaSchema,
    hue: channel,
    lightness: percentageSchema,
    saturation: percentageSchema,
  },
  Hsv: {alpha: alphaSchema, hue: channel, saturation: percentageSchema, value: percentageSchema},
  Hwb: {alpha: alphaSchema, blackness: percentageSchema, hue: channel, whiteness: percentageSchema},
  Cmyk: {
    alpha: alphaSchema,
    black: percentageSchema,
    cyan: percentageSchema,
    magenta: percentageSchema,
    yellow: percentageSchema,
  },
  Xyz: {alpha: alphaSchema, x: channel, y: channel, z: channel},
  Lab: {a: channel, alpha: alphaSchema, b: channel, lightness: percentageSchema},
  Lch: {alpha: alphaSchema, chroma: channel, hue: channel, lightness: percentageSchema},
  Css: {value: Schema.String},
});

/** @internal */
export const SizeSchema = Schema.TaggedUnion({
  Rm: {value: Schema.Finite},
  Px: {value: Schema.Finite},
  Em: {value: Schema.Finite},
  Percent: {value: Schema.Finite},
  Vh: {value: Schema.Finite},
  Vw: {value: Schema.Finite},
  Ch: {value: Schema.Finite},
  Css: {value: Schema.String},
});

const sizeToCss = (value: Size): string => {
  if (value._tag === "Rm") return `${value.value}rem`;
  if (value._tag === "Px") return `${value.value}px`;
  if (value._tag === "Em") return `${value.value}em`;
  if (value._tag === "Percent") return `${value.value}%`;
  if (value._tag === "Vh") return `${value.value}vh`;
  if (value._tag === "Vw") return `${value.value}vw`;
  if (value._tag === "Ch") return `${value.value}ch`;
  return value.value;
};

const EnumSchema = Schema.TaggedUnion({Enum: {value: Schema.String}});
/** @internal */
export type ManagedStyleValue = Color | Enum<string> | Size;
/** @internal */
export type StyleValue = ManagedStyleValue | number | string;
/** @internal */
const ManagedStyleValueSchema = Schema.Union([ColorSchema, EnumSchema, SizeSchema]);
const CssPrimitiveSchema = Schema.Union([Schema.String, Schema.Finite]);
/** @internal */
export const StyleValueSchema = Schema.Union([CssPrimitiveSchema, ManagedStyleValueSchema]);
/** @internal */
export function toCssValue(value: StyleValue): number | string {
  if (Schema.is(ColorSchema)(value)) return Color.toCss(value);
  if (Schema.is(EnumSchema)(value)) return value.value;
  if (Schema.is(SizeSchema)(value)) return sizeToCss(value);
  if (Schema.is(CssPrimitiveSchema)(value)) return value;
  throw new Error("Expected a CSS-compatible style value");
}
/** @internal */
export type EventListener<Value extends keyof React.DOMAttributes<HTMLElement>> = Listener<
  Exclude<React.DOMAttributes<HTMLElement>[Value], undefined>
>;
/** @internal */
export const ListenerSchema = Schema.TaggedStruct("Listener", {handle: Schema.Any});
