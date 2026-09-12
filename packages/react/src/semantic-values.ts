import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

type Finite = number;

const Alpha = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 1}));
const Byte = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 255}));
const Hue = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 360}));
const Percentage = Schema.Finite.check(Schema.isBetween({minimum: 0, maximum: 100}));

/**
 * A CSS length or an explicit CSS length expression.
 *
 * @since 0.2.0
 */
export type Size = Data.TaggedEnum<{
  readonly Px: {readonly value: Finite};
  readonly Rem: {readonly value: Finite};
  readonly Em: {readonly value: Finite};
  readonly Percent: {readonly value: Finite};
  readonly Vh: {readonly value: Finite};
  readonly Vw: {readonly value: Finite};
  readonly Ch: {readonly value: Finite};
  readonly Css: {readonly value: string};
}>;

const size = Data.taggedEnum<Size>();
const finite = Schema.decodeUnknownSync(Schema.Finite);

/**
 * Constructors for unit-tagged CSS sizes.
 *
 * @since 0.2.0
 */
export const Size = {
  ...size,
  Px: (value: number): Size => size.Px({value: finite(value)}),
  Rem: (value: number): Size => size.Rem({value: finite(value)}),
  Em: (value: number): Size => size.Em({value: finite(value)}),
  Percent: (value: number): Size => size.Percent({value: finite(value)}),
  Vh: (value: number): Size => size.Vh({value: finite(value)}),
  Vw: (value: number): Size => size.Vw({value: finite(value)}),
  Ch: (value: number): Size => size.Ch({value: finite(value)}),
  Css: (value: string): Size => size.Css({value}),
};

/**
 * The serializable schema for a CSS size.
 *
 * @since 0.2.0
 */
export const SizeSchema = Schema.TaggedUnion({
  Px: {value: Schema.Finite},
  Rem: {value: Schema.Finite},
  Em: {value: Schema.Finite},
  Percent: {value: Schema.Finite},
  Vh: {value: Schema.Finite},
  Vw: {value: Schema.Finite},
  Ch: {value: Schema.Finite},
  Css: {value: Schema.String},
});

/** @internal */
export const sizeToCss = (value: Size): string =>
  Match.value(value).pipe(
    Match.when({_tag: "Px"}, ({value}) => `${value}px`),
    Match.when({_tag: "Rem"}, ({value}) => `${value}rem`),
    Match.when({_tag: "Em"}, ({value}) => `${value}em`),
    Match.when({_tag: "Percent"}, ({value}) => `${value}%`),
    Match.when({_tag: "Vh"}, ({value}) => `${value}vh`),
    Match.when({_tag: "Vw"}, ({value}) => `${value}vw`),
    Match.when({_tag: "Ch"}, ({value}) => `${value}ch`),
    Match.when({_tag: "Css"}, ({value}) => value),
    Match.exhaustive,
  );

/**
 * A supported semantic CSS colour model.
 *
 * @since 0.2.0
 */
export type Color = Data.TaggedEnum<{
  readonly Rgb: {
    readonly alpha: Finite;
    readonly blue: Finite;
    readonly green: Finite;
    readonly red: Finite;
  };
  readonly Hsl: {
    readonly alpha: Finite;
    readonly hue: Finite;
    readonly lightness: Finite;
    readonly saturation: Finite;
  };
  readonly Css: {readonly value: string};
}>;

type Rgb = Extract<Color, {readonly _tag: "Rgb"}>;
type Hsl = Extract<Color, {readonly _tag: "Hsl"}>;
type Css = Extract<Color, {readonly _tag: "Css"}>;

const color = Data.taggedEnum<Color>();
const RgbInputSchema = Schema.Struct({
  red: Byte,
  green: Byte,
  blue: Byte,
  alpha: Schema.optionalKey(Alpha),
});
const HslInputSchema = Schema.Struct({
  hue: Schema.Finite,
  saturation: Percentage,
  lightness: Percentage,
  alpha: Schema.optionalKey(Alpha),
});

const normalizeHue = (value: number): number => ((value % 360) + 360) % 360;
const round = (value: number): string => String(Math.round(value * 10_000) / 10_000);

const rgb = (input: {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha?: number;
}): Rgb => {
  const decoded = Schema.decodeSync(RgbInputSchema)(input);
  return color.Rgb({...decoded, alpha: decoded.alpha ?? 1});
};

const hsl = (input: {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly alpha?: number;
}): Hsl => {
  const decoded = Schema.decodeSync(HslInputSchema)(input);
  return color.Hsl({...decoded, alpha: decoded.alpha ?? 1, hue: normalizeHue(decoded.hue)});
};

const css = (input: {readonly value: string}): Css => color.Css(input);

/**
 * Constructors and conversions for supported CSS colour models.
 *
 * @since 0.2.0
 */
export const Color = {
  ...color,
  Rgb: rgb,
  Hsl: hsl,
  Css: css,
  toRgb: (input: Color): Result.Result<Rgb, ColorConversionError> => {
    if (input._tag === "Rgb") return Result.succeed(input);
    if (input._tag === "Css") return Result.fail(new ColorConversionError({model: "Css"}));
    return Result.succeed(hslToRgb(input));
  },
  toHsl: (input: Color): Result.Result<Hsl, ColorConversionError> => {
    if (input._tag === "Hsl") return Result.succeed(input);
    if (input._tag === "Css") return Result.fail(new ColorConversionError({model: "Css"}));
    return Result.succeed(rgbToHsl(input));
  },
  toCss: (input: Color): string => {
    if (input._tag === "Css") return input.value;
    if (input._tag === "Rgb") {
      return `rgb(${round(input.red)} ${round(input.green)} ${round(input.blue)} / ${round(input.alpha)})`;
    }
    return `hsl(${round(input.hue)} ${round(input.saturation)}% ${round(input.lightness)}% / ${round(input.alpha)})`;
  },
  luminosity: (input: Color): Result.Result<number, ColorConversionError> =>
    Result.map(Color.toRgb(input), value => {
      const linear = (channel: number): number => {
        const normalized = channel / 255;
        return normalized <= 0.039_28 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * linear(value.red) + 0.7152 * linear(value.green) + 0.0722 * linear(value.blue)
      );
    }),
  contrast: (first: Color, second: Color): Result.Result<number, ColorConversionError> =>
    Result.flatMap(Color.luminosity(first), firstLuminosity =>
      Result.map(
        Color.luminosity(second),
        secondLuminosity =>
          (Math.max(firstLuminosity, secondLuminosity) + 0.05) /
          (Math.min(firstLuminosity, secondLuminosity) + 0.05),
      ),
    ),
};

/**
 * The serializable schema for a supported semantic colour.
 *
 * @since 0.2.0
 */
export const ColorSchema = Schema.TaggedUnion({
  Rgb: {red: Byte, green: Byte, blue: Byte, alpha: Alpha},
  Hsl: {hue: Hue, saturation: Percentage, lightness: Percentage, alpha: Alpha},
  Css: {value: Schema.String},
});

/**
 * A colour conversion that cannot be performed without parsing arbitrary CSS.
 *
 * @since 0.2.0
 */
export class ColorConversionError extends Schema.TaggedError<ColorConversionError>()(
  "@cascade/react/ColorConversionError",
  {model: Schema.Literal("Css")},
) {}

function hslToRgb(input: Hsl): Rgb {
  const saturation = input.saturation / 100;
  const lightness = input.lightness / 100;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number): number => {
    const sector = (offset + input.hue / 30) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(sector - 3, 9 - sector, 1));
  };
  return rgb({
    alpha: input.alpha,
    red: channel(0) * 255,
    green: channel(8) * 255,
    blue: channel(4) * 255,
  });
}

function rgbToHsl(input: Rgb): Hsl {
  const red = input.red / 255;
  const green = input.green / 255;
  const blue = input.blue / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  return hsl({
    alpha: input.alpha,
    hue:
      delta === 0
        ? 0
        : (Math.atan2(Math.sqrt(3) * (green - blue), 2 * red - green - blue) * 180) / Math.PI,
    lightness: lightness * 100,
    saturation: delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
  });
}

/** @internal */
export function toCssValue(value: Color | Size | number | string): string | number {
  if (Schema.is(ColorSchema)(value)) return Color.toCss(value);
  if (Schema.is(SizeSchema)(value)) return sizeToCss(value);
  return value;
}

/** @internal */
export const StyleValueSchema = Schema.Union([
  ColorSchema,
  SizeSchema,
  Schema.String,
  Schema.Finite,
]);
