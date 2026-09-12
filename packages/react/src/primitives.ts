import type * as React from "react";
import type {PascalCase} from "type-fest";
import type {TokenDefinition, TokenDefinitionRef} from "whuiy";
import {comptime} from "comptime";
import {typeInfo} from "typesugar";

import {Effect} from "effect";

import {Token} from "whuiy";

/** @since 0.2.0 */
export type StyleProperty = Extract<keyof React.CSSProperties, string>;
/** @since 0.2.0 */
export type EventProperty = Extract<keyof React.DOMAttributes<HTMLElement>, `on${string}`>;
/** @internal @since 0.2.0 */
export type ElementProperty = Extract<keyof HTMLElementTagNameMap, string>;

type EventEffect = Effect.Effect<void>;
type EventHandler<Property extends EventProperty> =
  NonNullable<React.DOMAttributes<HTMLElement>[Property]> extends (event: infer Event) => void
    ? (event: Event) => EventEffect
    : never;

type StyleValue<Property extends StyleProperty> = Exclude<React.CSSProperties[Property], undefined>;

/** @since 0.2.0 */
export type StyleToken<Property extends StyleProperty> = TokenDefinition<
  PascalCase<Property>,
  StyleValue<Property>
>;
/** @since 0.2.0 */
export type EventToken<Property extends EventProperty> = TokenDefinition<
  PascalCase<Property>,
  EventHandler<Property>
>;
/** @since 0.2.0 */
export type ElementToken<Property extends ElementProperty> = TokenDefinition<PascalCase<Property>>;

/** @since 0.2.0 */
export type StyleFamily = {
  readonly [Property in StyleProperty as PascalCase<Property>]: StyleToken<Property>;
};
/** @since 0.2.0 */
export type EventFamily = {
  readonly [Property in EventProperty as PascalCase<Property>]: EventToken<Property>;
};
/** @since 0.2.0 */
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
  // SAFETY: TypeScript cannot infer comptime's reflected literal keys; the generated entries are tested against every public family key.
  return definitions as Family;
}

/** @since 0.2.0 */
export const Style = createFamily<StyleFamily>(createDecoratorEntries("style", styleDescriptors));
/** @since 0.2.0 */
export const Event = createFamily<EventFamily>(createDecoratorEntries("event", eventDescriptors));
/** @since 0.2.0 */
export const Element = createFamily<ElementFamily>(createElementEntries(elementDescriptors));

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
