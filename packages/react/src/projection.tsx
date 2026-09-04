import type * as React from "react";
import type {LiveToken, TokenDefinitionRef, TokenValue} from "cascade";
import type {StyleValue} from "./semantic-values.ts";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {cloneElement, createElement} from "react";
import {ProjectionError} from "./errors.tsx";
import {
  Column,
  Image,
  Row,
  ListenerSchema,
  StyleValueSchema,
  Text,
  getDecoratorMetadata,
  getElementMetadata,
  toCssValue,
  unwrapListener,
} from "./primitives.ts";

type EventHandler = (event: never) => void;

interface Listener<Value extends EventHandler = EventHandler> {
  readonly tokenId: number;
  readonly value: Value;
}

type ManagedListener = {readonly _tag: "Listener"; readonly handle: EventHandler};

interface Decorators {
  readonly events: ReadonlyMap<string, readonly Listener[]>;
  readonly style: React.CSSProperties;
}

type HostProps = React.HTMLAttributes<HTMLElement> & {
  readonly alt?: string;
  readonly src?: string;
  readonly type?: string;
};

/**
 * Dispatches listener effects from React's imperative DOM callback boundary.
 *
 * The projection is deliberately parameterized by this service: it describes
 * listener work as `Effect` values without selecting a runtime for it.
 *
 * @internal
 */
export class ListenerDispatcher extends Context.Service<
  ListenerDispatcher,
  {
    readonly dispatch: (effect: Effect.Effect<void>) => void;
    readonly report: (options: {
      readonly cause: unknown;
      readonly tokenId: number;
    }) => Effect.Effect<void>;
  }
>()("@cascade/react/ListenerDispatcher") {}

const emptyDecorators: Decorators = {events: new Map(), style: {}};
function reads(token: LiveToken, definition: TokenDefinitionRef): TokenValue {
  if (token.definition !== definition) {
    throw new ProjectionError({
      cause: new Error(`Expected ${definition.name}, received ${token.definition.name}`),
      tokenId: token.id,
    });
  }
  return token.value();
}

function setStyle(options: {
  readonly property: string;
  readonly style: React.CSSProperties;
  readonly value: number | string;
}): void {
  Object.assign(options.style, {[options.property]: options.value});
}

function setEvent(options: {
  readonly property: string;
  readonly props: Partial<HostProps>;
  readonly value: EventHandler;
}): void {
  Object.assign(options.props, {[options.property]: options.value});
}

const isStyleValue = (value: TokenValue): value is StyleValue => Schema.is(StyleValueSchema)(value);
const isManagedListener: (value: TokenValue) => value is ManagedListener =
  Schema.is(ListenerSchema);

function collectDecorators(tokens: readonly LiveToken[], inherited: Decorators): Decorators {
  const events = new Map(inherited.events);
  const style: React.CSSProperties = {...inherited.style};
  for (const token of tokens) {
    const metadata = getDecoratorMetadata(token.definition);
    if (metadata === undefined) continue;
    if (metadata.kind === "style") {
      const value = reads(token, metadata.definition);
      if (!isStyleValue(value)) {
        throw new ProjectionError({
          cause: new Error(`${metadata.definition.name} requires a CSS-compatible value`),
          tokenId: token.id,
        });
      }
      setStyle({property: metadata.property, style, value: toCssValue(value)});
      continue;
    }
    const value = reads(token, metadata.definition);
    if (value === undefined) continue;
    if (!isManagedListener(value)) {
      throw new ProjectionError({
        cause: new Error(`${metadata.definition.name} requires a managed listener`),
        tokenId: token.id,
      });
    }
    const listeners = events.get(metadata.property) ?? [];
    events.set(metadata.property, [
      ...listeners,
      {tokenId: token.id, value: unwrapListener(value)},
    ]);
  }
  return {events, style};
}

function isDecorator(token: LiveToken): boolean {
  return getDecoratorMetadata(token.definition) !== undefined;
}

function listener(options: {
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly listeners: readonly Listener[];
}): EventHandler | undefined {
  if (options.listeners.length === 0) return undefined;
  const invoke = (event: never): void => {
    options.dispatcher.dispatch(
      Effect.forEach(
        options.listeners,
        item =>
          Effect.try({
            try: () => item.value(event),
            catch: cause => ({cause, tokenId: item.tokenId}),
          }).pipe(Effect.catch(options.dispatcher.report)),
        {discard: true},
      ),
    );
  };
  return invoke;
}

function applyDecorators(options: {
  readonly decorators: Decorators;
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly element: React.ReactElement;
}): React.ReactElement {
  const changes: Partial<HostProps> = {
    style: {...options.decorators.style, ...readStyle(options.element)},
  };
  for (const [property, listeners] of options.decorators.events) {
    const handler = listener({dispatcher: options.dispatcher, listeners});
    if (handler !== undefined) setEvent({property, props: changes, value: handler});
  }
  return cloneElement(options.element, changes);
}

const StylePropsSchema = Schema.Struct({
  style: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite])),
  ),
});

const readStyle = (element: React.ReactElement) => {
  const props = element.props;
  return Schema.is(StylePropsSchema)(props) ? props.style : undefined;
};

function hostElement(options: {
  readonly children: readonly React.ReactElement[];
  readonly inheritedValue: TokenValue;
  readonly token: LiveToken;
}): React.ReactElement | undefined {
  const value = options.token.hasValue() ? options.token.value() : options.inheritedValue;
  const element = getElementMetadata(options.token.definition);
  if (element !== undefined) {
    if (element.tag === "button") {
      return createElement<HostProps>(
        element.tag,
        {key: options.token.id, type: "button"},
        options.children,
      );
    }
    return createElement<HostProps>(element.tag, {key: options.token.id}, options.children);
  }
  if (options.token.definition === Row) {
    return createElement<HostProps>(
      "div",
      {key: options.token.id, style: {display: "flex", flexDirection: "row"}},
      options.children,
    );
  }
  if (options.token.definition === Column) {
    return createElement<HostProps>(
      "div",
      {key: options.token.id, style: {display: "flex", flexDirection: "column"}},
      options.children,
    );
  }
  if (options.token.definition === Text) {
    return createElement<HostProps>(
      "span",
      {key: options.token.id},
      value === undefined ? "" : String(value),
    );
  }
  if (options.token.definition === Image) {
    if (value === undefined) {
      throw new ProjectionError({
        cause: new Error("Image requires an { src, alt } value"),
        tokenId: options.token.id,
      });
    }
    if (!Schema.is(ImageSourceSchema)(value)) {
      throw new ProjectionError({
        cause: new Error("Image requires an { src, alt } value"),
        tokenId: options.token.id,
      });
    }
    const source = value;
    return createElement<HostProps>("img", {
      alt: source.alt,
      key: options.token.id,
      src: source.src,
    });
  }
  return undefined;
}

const ImageSourceSchema = Schema.Struct({alt: Schema.String, src: Schema.String});

function projectToken(options: {
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly inheritedValue: TokenValue;
  readonly path: ReadonlySet<number>;
  readonly token: LiveToken;
}): readonly React.ReactElement[] {
  if (options.path.has(options.token.id)) {
    throw new ProjectionError({
      cause: new Error("A cycle was found while projecting Cascade tokens"),
      tokenId: options.token.id,
    });
  }
  const path = new Set(options.path);
  path.add(options.token.id);
  const relations = options.token.tokens();
  const decorators = collectDecorators(relations, emptyDecorators);
  const content = relations.filter(token => !isDecorator(token));
  const inheritedValue = options.token.hasValue() ? options.token.value() : options.inheritedValue;
  const children = content.flatMap(token =>
    projectToken({dispatcher: options.dispatcher, inheritedValue, path, token}),
  );
  const host = hostElement({
    children,
    inheritedValue: options.inheritedValue,
    token: options.token,
  });
  if (host !== undefined) {
    return [applyDecorators({decorators, dispatcher: options.dispatcher, element: host})];
  }
  if (children.length === 0) return [];
  if (children.length === 1) {
    const child = children[0];
    return child === undefined
      ? []
      : [applyDecorators({decorators, dispatcher: options.dispatcher, element: child})];
  }
  return [
    applyDecorators({
      decorators,
      dispatcher: options.dispatcher,
      element: createElement<HostProps>("div", {key: options.token.id}, children),
    }),
  ];
}

export const project = Effect.fn("ReactProjection.project")(function* (options: {
  readonly roots: readonly LiveToken[];
}): Effect.fn.Return<readonly React.ReactElement[], never, ListenerDispatcher> {
  const dispatcher = yield* ListenerDispatcher;
  return options.roots.flatMap(token =>
    projectToken({dispatcher, inheritedValue: undefined, path: new Set(), token}),
  );
});
