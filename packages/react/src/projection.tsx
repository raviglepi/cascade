import type * as React from "react";
import type {LiveToken, TokenDefinitionRef, TokenValue} from "cascade";

import {Context, Effect, Predicate, Schema} from "effect";

import {cloneElement, createElement} from "react";
import {ProjectionError} from "./errors.tsx";
import {Column, Image, Row, Text, getDecoratorMetadata, getElementMetadata} from "./primitives.ts";

type EventHandler = (event: React.SyntheticEvent<HTMLElement>) => Effect.Effect<void, unknown>;
type Handler = {readonly tokenId: number; readonly value: EventHandler};
interface Decorators {
  readonly events: ReadonlyMap<string, readonly Handler[]>;
  readonly style: React.CSSProperties;
}
type HostProps = React.HTMLAttributes<HTMLElement> & {
  readonly alt?: string;
  readonly src?: string;
  readonly type?: string;
} & React.Attributes;

/** [internal](internal) */
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
const ImageSourceSchema = Schema.Struct({alt: Schema.String, src: Schema.String});

function reads(token: LiveToken, definition: TokenDefinitionRef): TokenValue {
  if (token.definition !== definition) {
    throw new ProjectionError({
      cause: new Error(`Expected ${definition.name}, received ${token.definition.name}`),
      tokenId: token.id,
    });
  }
  return token.value();
}

function isListener(value: TokenValue): value is EventHandler {
  return Predicate.isFunction(value);
}

function requiredHandler(options: {
  readonly token: LiveToken;
  readonly value: TokenValue;
}): Handler {
  if (!isListener(options.value)) {
    throw new ProjectionError({
      cause: new Error(`${options.token.definition.name} requires an Effect listener`),
      tokenId: options.token.id,
    });
  }
  return {tokenId: options.token.id, value: options.value};
}

function appendListener(options: {
  readonly events: Map<string, readonly Handler[]>;
  readonly property: string;
  readonly token: LiveToken;
  readonly value: TokenValue;
}): void {
  if (options.value === undefined) return;
  const listeners = options.events.get(options.property) ?? [];
  options.events.set(options.property, [...listeners, requiredHandler(options)]);
}

function collectDecorator(options: {
  readonly events: Map<string, readonly Handler[]>;
  readonly style: React.CSSProperties;
  readonly token: LiveToken;
}): void {
  const metadata = getDecoratorMetadata(options.token.definition);
  if (metadata === undefined) return;
  const value = reads(options.token, metadata.definition);
  if (metadata.kind === "style") {
    Object.assign(options.style, {[metadata.property]: value});
    return;
  }
  appendListener({
    events: options.events,
    property: metadata.property,
    token: options.token,
    value,
  });
}

function collectDecorators(tokens: readonly LiveToken[], inherited: Decorators): Decorators {
  const events = new Map(inherited.events);
  const style: React.CSSProperties = {...inherited.style};
  for (const token of tokens) collectDecorator({events, style, token});
  return {events, style};
}

function isDecorator(token: LiveToken): boolean {
  return getDecoratorMetadata(token.definition) !== undefined;
}

function makeListener(options: {
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly listeners: readonly Handler[];
}): ((event: React.SyntheticEvent<HTMLElement>) => void) | undefined {
  if (options.listeners.length === 0) return undefined;
  return event => {
    options.dispatcher.dispatch(
      Effect.forEach(
        options.listeners,
        item =>
          item
            .value(event)
            .pipe(
              Effect.catchCause(cause => options.dispatcher.report({cause, tokenId: item.tokenId})),
            ),
        {discard: true},
      ),
    );
  };
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
    const listener = makeListener({dispatcher: options.dispatcher, listeners});
    if (listener !== undefined) Object.assign(changes, {[property]: listener});
  }
  return cloneElement(options.element, changes);
}

const StylePropsSchema = Schema.Struct({
  style: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite])),
  ),
});

function readStyle(element: React.ReactElement): React.CSSProperties | undefined {
  return Schema.is(StylePropsSchema)(element.props) ? element.props.style : undefined;
}

function elementHost(options: {
  readonly children: readonly React.ReactElement[];
  readonly token: LiveToken;
}): React.ReactElement | undefined {
  const element = getElementMetadata(options.token.definition);
  if (element === undefined) return undefined;
  const props: HostProps =
    element.tag === "button" ? {key: options.token.id, type: "button"} : {key: options.token.id};
  return createElement<HostProps>(element.tag, props, options.children);
}

const layoutStyles = new Map<TokenDefinitionRef, React.CSSProperties>([
  [Row, {display: "flex", flexDirection: "row"}],
  [Column, {display: "flex", flexDirection: "column"}],
]);

function layoutHost(options: {
  readonly children: readonly React.ReactElement[];
  readonly token: LiveToken;
}): React.ReactElement | undefined {
  const style = layoutStyles.get(options.token.definition);
  if (style === undefined) return undefined;
  return createElement<HostProps>("div", {key: options.token.id, style}, options.children);
}

function textHost(token: LiveToken, value: TokenValue): React.ReactElement | undefined {
  if (token.definition !== Text) return undefined;
  return createElement<HostProps>(
    "span",
    {key: token.id},
    value === undefined ? "" : String(value),
  );
}

function imageHost(token: LiveToken, value: TokenValue): React.ReactElement | undefined {
  if (token.definition !== Image) return undefined;
  if (!Schema.is(ImageSourceSchema)(value)) {
    throw new ProjectionError({
      cause: new Error("Image requires an { src, alt } value"),
      tokenId: token.id,
    });
  }
  return createElement<HostProps>("img", {alt: value.alt, key: token.id, src: value.src});
}

function hostElement(options: {
  readonly children: readonly React.ReactElement[];
  readonly inheritedValue: TokenValue;
  readonly token: LiveToken;
}): React.ReactElement | undefined {
  const value = options.token.hasValue() ? options.token.value() : options.inheritedValue;
  return [
    elementHost(options),
    layoutHost(options),
    textHost(options.token, value),
    imageHost(options.token, value),
  ].find(isElement);
}

function isElement(value: React.ReactElement | undefined): value is React.ReactElement {
  return value !== undefined;
}

function nextPath(path: ReadonlySet<number>, token: LiveToken): ReadonlySet<number> {
  if (path.has(token.id)) {
    throw new ProjectionError({
      cause: new Error("A cycle was found while projecting Cascade tokens"),
      tokenId: token.id,
    });
  }
  return new Set(path).add(token.id);
}

function projectContent(options: {
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly inheritedValue: TokenValue;
  readonly path: ReadonlySet<number>;
  readonly relations: readonly LiveToken[];
}): readonly React.ReactElement[] {
  const content = options.relations.filter(token => !isDecorator(token));
  return content.flatMap(token =>
    projectToken({
      dispatcher: options.dispatcher,
      inheritedValue: options.inheritedValue,
      path: options.path,
      token,
    }),
  );
}

function onlyChild(children: readonly React.ReactElement[]): React.ReactElement {
  const child = children[0];
  if (child === undefined) throw new Error("Expected one projected child");
  return child;
}

function decorateHost(options: {
  readonly decorators: Decorators;
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly host: React.ReactElement;
}): readonly React.ReactElement[] {
  return [
    applyDecorators({
      decorators: options.decorators,
      dispatcher: options.dispatcher,
      element: options.host,
    }),
  ];
}

function decorateContent(options: {
  readonly children: readonly React.ReactElement[];
  readonly decorators: Decorators;
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly token: LiveToken;
}): readonly React.ReactElement[] {
  if (options.children.length === 0) return [];
  const element =
    options.children.length === 1
      ? onlyChild(options.children)
      : createElement<HostProps>("div", {key: options.token.id}, options.children);
  return [
    applyDecorators({decorators: options.decorators, dispatcher: options.dispatcher, element}),
  ];
}

function decorateChildren(options: {
  readonly children: readonly React.ReactElement[];
  readonly decorators: Decorators;
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly host: React.ReactElement | undefined;
  readonly token: LiveToken;
}): readonly React.ReactElement[] {
  return options.host === undefined
    ? decorateContent(options)
    : decorateHost({
        decorators: options.decorators,
        dispatcher: options.dispatcher,
        host: options.host,
      });
}

function projectToken(options: {
  readonly dispatcher: ListenerDispatcher["Service"];
  readonly inheritedValue: TokenValue;
  readonly path: ReadonlySet<number>;
  readonly token: LiveToken;
}): readonly React.ReactElement[] {
  const path = nextPath(options.path, options.token);
  const relations = options.token.tokens();
  const decorators = collectDecorators(relations, emptyDecorators);
  const inheritedValue = options.token.hasValue() ? options.token.value() : options.inheritedValue;
  const children = projectContent({
    dispatcher: options.dispatcher,
    inheritedValue,
    path,
    relations,
  });
  const host = hostElement({
    children,
    inheritedValue: options.inheritedValue,
    token: options.token,
  });
  return decorateChildren({
    children,
    decorators,
    dispatcher: options.dispatcher,
    host,
    token: options.token,
  });
}

/** [internal](internal) */
export const project = Effect.fn("ReactProjection.project")(function* (options: {
  readonly roots: readonly LiveToken[];
}): Effect.fn.Return<readonly React.ReactElement[], never, ListenerDispatcher> {
  const dispatcher = yield* ListenerDispatcher;
  return options.roots.flatMap(token =>
    projectToken({dispatcher, inheritedValue: undefined, path: new Set(), token}),
  );
});
