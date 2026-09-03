import type * as React from "react";

import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

/** @internal */
export type Color<Value extends string = string> = Data.TaggedEnum<{
  readonly Color: {readonly value: Value};
}>;

/** @internal */
export const Color = <Value extends string>(value: Value): Color<Value> => ({_tag: "Color", value});

/** @internal */
export type Size<Value extends number | string = number | string> = Data.TaggedEnum<{
  readonly Size: {readonly value: Value};
}>;

/** @internal */
export const Size = <Value extends number | string>(value: Value): Size<Value> => ({
  _tag: "Size",
  value,
});

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

/** @internal */
export type ManagedStyleValue = Color | Enum<string> | Size;

/** @internal */
export type StyleValue = ManagedStyleValue | number | string;

/** @internal */
const ManagedStyleValueSchema = Schema.TaggedUnion({
  Color: {value: Schema.String},
  Enum: {value: Schema.String},
  Size: {value: Schema.Union([Schema.String, Schema.Finite])},
});

/** @internal */
export const StyleValueSchema = Schema.Union([
  Schema.String,
  Schema.Finite,
  ManagedStyleValueSchema,
]);

/** @internal */
export function toCssValue(value: StyleValue): number | string {
  return Schema.is(ManagedStyleValueSchema)(value) ? value.value : value;
}

/** @internal */
export type EventListener<Value extends keyof React.DOMAttributes<HTMLElement>> = Listener<
  Exclude<React.DOMAttributes<HTMLElement>[Value], undefined>
>;

/** @internal */
export const ListenerSchema = Schema.TaggedStruct("Listener", {handle: Schema.Any});
