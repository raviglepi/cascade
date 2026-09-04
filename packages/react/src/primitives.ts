import type * as React from "react";
import type {IsEqual, PascalCase, UnionMember, UnionToTuple} from "type-fest";
import type {TokenDefinition, TokenDefinitionRef} from "cascade";
import type {
  Color as ColorValue,
  Enum as EnumValue,
  Size as SizeValue,
  EventListener,
  StyleValue as SemanticStyleValue,
} from "./semantic-values.ts";
import {comptime} from "comptime";
import {typeInfo} from "typesugar";

import {Token} from "cascade";
import {
  Color as makeColor,
  Enum as makeEnum,
  Listener as makeListener,
  Size as makeSize,
  ListenerSchema as listenerSchema,
  StyleValueSchema as styleValueSchema,
  toCssValue as unwrapCssValue,
  unwrapListener as unwrapManagedListener,
} from "./semantic-values.ts";

/** @since 0.1.0 */
export interface ImageSource {
  readonly alt: string;
  readonly src: string;
}

/** @internal */
export type StyleProperty = Extract<keyof React.CSSProperties, string>;
/** @internal */
export type EventProperty = Extract<keyof React.DOMAttributes<HTMLElement>, `on${string}`>;
/** @internal */
export type ElementProperty = Extract<keyof HTMLElementTagNameMap, string>;
/** @internal */
export type ManagedStyleValue = SemanticStyleValue;
type Present<Value> = Exclude<Value, undefined>;
type PropertyValue<Property extends StyleProperty> = Present<React.CSSProperties[Property]>;

/**
 * Finds an arbitrary string member without widening closed CSS literal unions.
 *
 * `UnionMember` is significant here: directly testing `string extends
 * StringValue<Property>` loses the distinction for the branded string members
 * used by `csstype`.
 *
 * @internal
 */
type HasFreeFormString<Value> = string extends UnionMember<string & Value> ? true : false;

/**
 * Colors retain literal colour names alongside their free-form CSS colour
 * value. Removing `red` therefore changes a colour property but not an
 * unrelated string property.
 *
 * @internal
 */
type IsColor<Value> = IsEqual<Exclude<Value, "red">, Value> extends true ? false : true;

/**
 * CSS globals make a length value observably different from an unconstrained
 * numeric property. This lets `height` become `Size` while `opacity` remains
 * the plain number developers expect.
 *
 * @internal
 */
type IsInheritable<Value> = IsEqual<Exclude<Value, "inherit">, Value> extends true ? false : true;

/** @internal */
type HasNumber<Value> = [Extract<Value, number>] extends [never] ? false : true;

/** @internal */
type IsPlainNumber<Value> =
  HasFreeFormString<Value> extends false
    ? HasNumber<Value> extends true
      ? IsInheritable<Value> extends false
        ? true
        : false
      : false
    : false;

/** @internal */
type IsFiniteEnum<Value> =
  HasFreeFormString<Value> extends false
    ? HasNumber<Value> extends true
      ? false
      : [Extract<Value, string>] extends [never]
        ? false
        : true
    : false;

/** @internal */
type SizeProperty = Extract<
  StyleProperty,
  | "blockSize"
  | "columnGap"
  | "fontSize"
  | "gap"
  | "height"
  | "inlineSize"
  | "letterSpacing"
  | "lineHeight"
  | "maxHeight"
  | "maxWidth"
  | "minHeight"
  | "minWidth"
  | "rowGap"
  | "width"
  | `${"margin" | "padding"}${string}`
>;

/** @internal */
type RawPropertyInput<Value> =
  IsPlainNumber<Value> extends true ? Extract<Value, number> : Extract<Value, string | number>;

/**
 * Classifies style values directly from React's CSS type, rather than keeping
 * a hand-maintained list of CSS properties.
 *
 * The order matters: colours and sizes both include CSS globals, and finite
 * unions such as `flexWrap` must remain enums before their global values can
 * be mistaken for a length.
 *
 * @internal
 */
type PropertyInput<Property extends StyleProperty, Value = PropertyValue<Property>> =
  IsColor<Value> extends true
    ? ColorValue
    : IsPlainNumber<Value> extends true
      ? Extract<Value, number>
      : IsFiniteEnum<Value> extends true
        ? EnumValue<Extract<Value, string>>
        : Property extends SizeProperty
          ? SizeValue
          : RawPropertyInput<Value>;

/** @internal */
export type StyleToken<Property extends StyleProperty> = TokenDefinition<
  PascalCase<Property>,
  PropertyInput<Property>
>;

/** @internal */
export type EventToken<Property extends EventProperty> = TokenDefinition<
  PascalCase<Property>,
  EventListener<Property>
>;

/** @internal */
export type ElementToken<Property extends ElementProperty> = TokenDefinition<PascalCase<Property>>;

/** @internal */
export type StyleFamily = {
  readonly [Property in StyleProperty as PascalCase<Property>]: StyleToken<Property>;
};

/** @internal */
export type EventFamily = {
  readonly [Property in EventProperty as PascalCase<Property>]: EventToken<Property>;
};

/** @internal */
export type ElementFamily = {
  readonly [Property in ElementProperty as PascalCase<Property>]: ElementToken<Property>;
};

/** @internal */
export type DecoratorMetadata =
  | {readonly definition: TokenDefinitionRef; readonly kind: "event"; readonly property: string}
  | {readonly definition: TokenDefinitionRef; readonly kind: "style"; readonly property: string};

/** @internal */
export interface ElementMetadata {
  readonly definition: TokenDefinitionRef;
  readonly kind: "element";
  readonly tag: string;
}

/** @internal */
export type PrimitiveMetadata = DecoratorMetadata | ElementMetadata;

type Descriptor = {readonly name: string; readonly type: string};
type TokenEntry = {readonly definition: TokenDefinitionRef; readonly metadata: PrimitiveMetadata};

const styleDescriptors = comptime(() =>
  typeInfo<React.CSSProperties>()
    .fields.filter(isStyleDescriptor)
    .map(field => ({name: field.name, type: field.type})),
);
const eventDescriptors = comptime(() =>
  typeInfo<React.DOMAttributes<HTMLElement>>()
    .fields.filter(isEventDescriptor)
    .map(field => ({name: field.name, type: field.type})),
);
const elementDescriptors = comptime(() =>
  typeInfo<HTMLElementTagNameMap>()
    .fields.filter(isElementDescriptor)
    .map(field => ({name: field.name, type: field.type})),
);

/**
 * Finite `flexWrap` metadata materialized through `UnionToTuple`.
 *
 * This proves the union-to-enum path used by generated style tokens. CSS
 * properties that admit arbitrary strings, including `color` and `padding`,
 * remain value objects rather than dishonest finite enums.
 *
 * @internal
 */
export const FlexWrapValues = comptime(() =>
  typeInfo<UnionToTuple<Exclude<React.CSSProperties["flexWrap"], undefined>>>()
    .fields.filter(field => Number.isInteger(Number(field.name)))
    .map(field => field.type.slice(1, -1))
    .sort(),
);

const metadata = new WeakMap<TokenDefinitionRef, PrimitiveMetadata>();

function createEntries(
  kind: DecoratorMetadata["kind"],
  descriptors: readonly Descriptor[],
): readonly TokenEntry[] {
  return descriptors.map(descriptor => {
    const definition = Token(descriptor.name.charAt(0).toUpperCase() + descriptor.name.slice(1))();
    const decoratorMetadata: DecoratorMetadata =
      kind === "style"
        ? {definition, kind, property: descriptor.name}
        : {definition, kind, property: descriptor.name};
    metadata.set(definition, decoratorMetadata);
    return {definition, metadata: decoratorMetadata};
  });
}

function createElementEntries(descriptors: readonly Descriptor[]): readonly TokenEntry[] {
  return descriptors.map(descriptor => {
    const definition = Token(descriptor.name.charAt(0).toUpperCase() + descriptor.name.slice(1))();
    const elementMetadata: ElementMetadata = {definition, kind: "element", tag: descriptor.name};
    metadata.set(definition, elementMetadata);
    return {definition, metadata: elementMetadata};
  });
}

const styleEntries = createEntries("style", styleDescriptors);
const eventEntries = createEntries("event", eventDescriptors);
const elementEntries = createElementEntries(elementDescriptors);

function family<Family extends object>(entries: readonly TokenEntry[]): Family {
  return Object.assign(
    Object.create(null),
    Object.fromEntries(entries.map(entry => [entry.definition.name, entry.definition])),
  );
}

/**
 * Generated tokens for all React inline-style properties.
 *
 * `Style.Padding` accepts `Size`, `Style.BorderColor` accepts `Color`, and
 * `Style.FlexWrap` accepts a literal-preserving `Enum` value.
 *
 * @internal
 */
export const Style = family<StyleFamily>(styleEntries);

/**
 * Generated tokens for all HTMLElement DOM listeners.
 *
 * Each event token accepts a `Listener`, making callbacks a distinct value in
 * the Cascade graph.
 *
 * @internal
 */
export const Event = family<EventFamily>(eventEntries);

/**
 * Generated concrete host tokens derived from `HTMLElementTagNameMap`.
 *
 * `Element.Button` always projects to a `button`; a future `Button` concept
 * can therefore choose a different host without weakening this contract.
 *
 * @internal
 */
export const Element = family<ElementFamily>(elementEntries);

/** @internal */
export function getDecoratorMetadata(
  definition: TokenDefinitionRef,
): DecoratorMetadata | undefined {
  const entry = metadata.get(definition);
  return entry?.kind === "element" ? undefined : entry;
}

/** @internal */
export function getElementMetadata(definition: TokenDefinitionRef): ElementMetadata | undefined {
  const entry = metadata.get(definition);
  return entry?.kind === "element" ? entry : undefined;
}

function isStyleDescriptor(field: {
  readonly name: string;
  readonly type: string;
}): field is Descriptor {
  return !field.name.startsWith("__@") && field.name.length > 0;
}

function isEventDescriptor(field: {
  readonly name: string;
  readonly type: string;
}): field is Descriptor {
  return field.name.startsWith("on");
}

function isElementDescriptor(field: {
  readonly name: string;
  readonly type: string;
}): field is Descriptor {
  return !field.name.startsWith("__@") && field.name.length > 0;
}

/** @since 0.1.0 */
export const Row = Token("Row")();
/** @since 0.1.0 */
export const Column = Token("Column")();
/** @since 0.1.0 */
export const Text = Token("Text")<string>();
/** @since 0.1.0 */
export const Image = Token("Image")<ImageSource>();
/** @since 0.1.0 */

/** @internal */
export const Color = makeColor;
/** @internal */
export const Enum = makeEnum;
/** @internal */
export const Listener = makeListener;
/** @internal */
export const ListenerSchema = listenerSchema;
/** @internal */
export const Size = makeSize;
/** @internal */
export const StyleValueSchema = styleValueSchema;
/** @internal */
export const toCssValue = unwrapCssValue;
/** @internal */
export const unwrapListener = unwrapManagedListener;
