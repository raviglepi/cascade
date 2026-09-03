/** @since 0.1.0 */

import type {
  EventFamily as PrimitiveEventFamily,
  EventProperty as PrimitiveEventProperty,
  EventToken as PrimitiveEventToken,
  StyleFamily as PrimitiveStyleFamily,
  StyleProperty as PrimitiveStyleProperty,
  StyleToken as PrimitiveStyleToken,
} from "./primitives.ts";

import {
  Color as color,
  Element as element,
  Enum as enumValue,
  Event as generatedEvent,
  Listener as listener,
  Size as size,
  Style as generatedStyle,
} from "./primitives.ts";

export {
  /** @since 0.1.0 */
  CascadeErrorBoundary,
  /** @since 0.1.0 */
  ProjectionError,
} from "./errors.tsx";
export type {
  /** @since 0.1.0 */
  CascadeReactReport,
  /** @since 0.1.0 */
  ErrorReporter,
} from "./errors.tsx";
export {
  /** @since 0.1.0 */
  Column,
  /** @since 0.1.0 */
  Image,
  /** @since 0.1.0 */
  Row,
  /** @since 0.1.0 */
  Text,
} from "./primitives.ts";
/** @internal */
export const Color = color;
/** @internal */
export const Enum = enumValue;
/** @internal */
export const Listener = listener;
/** @internal */
export const Size = size;
export type {
  /** @since 0.1.0 */
  ImageSource,
} from "./primitives.ts";
/** @internal */
export const Event = generatedEvent;
/** @internal */
export const Style = generatedStyle;
/** @internal */
export const Element = element;
/** @internal */
export type EventFamily = PrimitiveEventFamily;
/** @internal */
export type EventProperty = PrimitiveEventProperty;
/** @internal */
export type EventToken<Property extends EventProperty> = PrimitiveEventToken<Property>;
/** @internal */
export type StyleFamily = PrimitiveStyleFamily;
/** @internal */
export type StyleProperty = PrimitiveStyleProperty;
/** @internal */
export type StyleToken<Property extends StyleProperty> = PrimitiveStyleToken<Property>;
export {
  /** @since 0.1.0 */
  createReactRenderer,
} from "./renderer.tsx";
export type {
  /** @since 0.1.0 */
  ReactRenderer,
  /** @since 0.1.0 */
  ReactRendererOptions,
} from "./renderer.tsx";
export {
  /** @since 0.1.0 */
  Rules,
} from "./rules.ts";
