import type * as React from "react";
import type {PascalCase} from "type-fest";
import type {TokenDefinition, TokenDefinitionRef} from "cascade";
import {comptime} from "comptime";
import {typeInfo} from "typesugar";

import {Effect} from "effect";

import {Token} from "cascade";

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export interface ImageSource {
  readonly alt: string;
  readonly src: string;
}

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type StyleProperty = Extract<keyof React.CSSProperties, string>;
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type EventProperty = Extract<keyof React.DOMAttributes<HTMLElement>, `on${string}`>;
/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export type ElementProperty = Extract<keyof HTMLElementTagNameMap, string>;

type StyleValue<Property extends StyleProperty> = Exclude<React.CSSProperties[Property], undefined>;
type EventEffect = Effect.Effect<void, unknown>;
type EventHandler<Property extends EventProperty> =
  NonNullable<React.DOMAttributes<HTMLElement>[Property]> extends (event: infer Event) => void
    ? (event: Event) => EventEffect
    : never;

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type StyleToken<Property extends StyleProperty> = TokenDefinition<
  PascalCase<Property>,
  StyleValue<Property>
>;
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type EventToken<Property extends EventProperty> = TokenDefinition<
  PascalCase<Property>,
  EventHandler<Property>
>;
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type ElementToken<Property extends ElementProperty> = TokenDefinition<PascalCase<Property>>;

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type StyleFamily = {
  readonly [Property in StyleProperty as PascalCase<Property>]: StyleToken<Property>;
};
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type EventFamily = {
  readonly [Property in EventProperty as PascalCase<Property>]: EventToken<Property>;
};
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export type ElementFamily = {
  readonly [Property in ElementProperty as PascalCase<Property>]: ElementToken<Property>;
};

/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export type DecoratorMetadata =
  | {readonly definition: TokenDefinitionRef; readonly kind: "event"; readonly property: string}
  | {readonly definition: TokenDefinitionRef; readonly kind: "style"; readonly property: string};
/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export interface ElementMetadata {
  readonly definition: TokenDefinitionRef;
  readonly kind: "element";
  readonly tag: string;
}
/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export type PrimitiveMetadata = DecoratorMetadata | ElementMetadata;

type Descriptor = {readonly name: string};
type TokenEntry = {readonly definition: TokenDefinitionRef; readonly metadata: PrimitiveMetadata};

const styleDescriptors = comptime(() =>
  typeInfo<React.CSSProperties>()
    .fields.filter(field => !field.name.startsWith("__@") && field.name.length > 0)
    .map(field => ({name: field.name})),
);
const eventDescriptors = comptime(() =>
  typeInfo<React.DOMAttributes<HTMLElement>>()
    .fields.filter(field => field.name.startsWith("on"))
    .map(field => ({name: field.name})),
);
const elementDescriptors = comptime(() =>
  typeInfo<HTMLElementTagNameMap>()
    .fields.filter(field => !field.name.startsWith("__@") && field.name.length > 0)
    .map(field => ({name: field.name})),
);

const metadata = new WeakMap<TokenDefinitionRef, PrimitiveMetadata>();

function definitionName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function createDecoratorEntries(
  kind: DecoratorMetadata["kind"],
  descriptors: readonly Descriptor[],
): readonly TokenEntry[] {
  return descriptors.map(descriptor => {
    const definition = Token(definitionName(descriptor.name))();
    const entry: DecoratorMetadata = {definition, kind, property: descriptor.name};
    metadata.set(definition, entry);
    return {definition, metadata: entry};
  });
}

function createElementEntries(descriptors: readonly Descriptor[]): readonly TokenEntry[] {
  return descriptors.map(descriptor => {
    const definition = Token(definitionName(descriptor.name))();
    const entry: ElementMetadata = {definition, kind: "element", tag: descriptor.name};
    metadata.set(definition, entry);
    return {definition, metadata: entry};
  });
}

function createFamily<Family>(entries: readonly TokenEntry[]): Family {
  const definitions = Object.fromEntries(
    entries.map(entry => [entry.definition.name, entry.definition]),
  );
  // SAFETY: comptime reflects the exact keys of the family source type, and each entry is a Token definition.
  return definitions as Family;
}

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Style = createFamily<StyleFamily>(createDecoratorEntries("style", styleDescriptors));
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Event = createFamily<EventFamily>(createDecoratorEntries("event", eventDescriptors));
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Element = createFamily<ElementFamily>(createElementEntries(elementDescriptors));

/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export function getDecoratorMetadata(
  definition: TokenDefinitionRef,
): DecoratorMetadata | undefined {
  const entry = metadata.get(definition);
  return entry?.kind === "element" ? undefined : entry;
}

/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export function getElementMetadata(definition: TokenDefinitionRef): ElementMetadata | undefined {
  const entry = metadata.get(definition);
  return entry?.kind === "element" ? entry : undefined;
}

/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Row = Token("Row")();
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Column = Token("Column")();
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Text = Token("Text")<string>();
/**
 * [since](since) 0.1.0
 *
 * @since 0.1.0
 */
export const Image = Token("Image")<ImageSource>();
