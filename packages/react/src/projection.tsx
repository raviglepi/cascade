import type {CSSProperties, KeyboardEventHandler, MouseEventHandler, ReactElement} from "react";
import type {LiveToken, TokenDefinitionRef, TokenValue} from "cascade";
import type {ErrorReporter} from "./errors.tsx";
import type {ImageSource, SpacingValue, VisibilityValue} from "./primitives.ts";

import {cloneElement, createElement} from "react";
import {ProjectionError} from "./errors.tsx";
import {
  ButtonElement,
  Color,
  Column,
  Gap,
  Image,
  OnClick,
  OnKeyDown,
  Opacity,
  Padding,
  Row,
  Text,
  Visibility,
} from "./primitives.ts";

interface Listener<Value> {
  readonly tokenId: number;
  readonly value: Value;
}

interface Decorators {
  readonly clicks: readonly Listener<MouseEventHandler<HTMLElement>>[];
  readonly keys: readonly Listener<KeyboardEventHandler<HTMLElement>>[];
  readonly style: CSSProperties;
}

interface HostProps {
  readonly children?: ReactElement | readonly ReactElement[] | string;
  readonly onClick?: MouseEventHandler<HTMLElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLElement>;
  readonly style?: CSSProperties;
}

interface HostChanges {
  onClick?: MouseEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  style: CSSProperties;
}

const emptyDecorators: Decorators = {clicks: [], keys: [], style: {}};
function reads<Definition extends TokenDefinitionRef>(
  token: LiveToken,
  definition: Definition,
): ReturnType<LiveToken<Definition>["value"]> {
  if (token.definition !== definition) {
    throw new ProjectionError({
      cause: new Error(`Expected ${definition.name}, received ${token.definition.name}`),
      tokenId: token.id,
    });
  }
  // SAFETY: definition identity proves the value type represented by this live token.
  return token.value() as ReturnType<LiveToken<Definition>["value"]>;
}

function collectDecorators(tokens: readonly LiveToken[], inherited: Decorators): Decorators {
  const clicks = [...inherited.clicks];
  const keys = [...inherited.keys];
  const style: CSSProperties = {...inherited.style};
  for (const token of tokens) {
    if (token.definition === Opacity) style.opacity = reads(token, Opacity);
    if (token.definition === Color) style.color = reads(token, Color);
    if (token.definition === Gap) style.gap = reads(token, Gap);
    if (token.definition === Padding) style.padding = reads(token, Padding);
    if (token.definition === Visibility) {
      style.visibility = reads(token, Visibility);
    }
    if (token.definition === OnClick) {
      const value = reads(token, OnClick);
      if (value !== undefined) clicks.push({tokenId: token.id, value});
    }
    if (token.definition === OnKeyDown) {
      const value = reads(token, OnKeyDown);
      if (value !== undefined) keys.push({tokenId: token.id, value});
    }
  }
  return {clicks, keys, style};
}

function isDecorator(token: LiveToken): boolean {
  return (
    token.definition === Opacity ||
    token.definition === Color ||
    token.definition === Gap ||
    token.definition === Padding ||
    token.definition === Visibility ||
    token.definition === OnClick ||
    token.definition === OnKeyDown
  );
}

function listener<Value extends (event: never) => void>(options: {
  readonly listeners: readonly Listener<Value>[];
  readonly reportError: ErrorReporter;
}): Value | undefined {
  if (options.listeners.length === 0) return undefined;
  const invoke = (event: never): void => {
    for (const item of options.listeners) {
      try {
        item.value(event);
      } catch (cause) {
        options.reportError({cause, kind: "listener", tokenId: item.tokenId});
      }
    }
  };
  // SAFETY: the wrapper forwards the event accepted by every collected listener.
  return invoke as Value;
}

function applyDecorators(options: {
  readonly decorators: Decorators;
  readonly element: ReactElement;
  readonly reportError: ErrorReporter;
}): ReactElement {
  // SAFETY: this module creates projected hosts with HostProps-compatible props.
  const current = options.element.props as HostProps;
  const clicks = listener({listeners: options.decorators.clicks, reportError: options.reportError});
  const keys = listener({listeners: options.decorators.keys, reportError: options.reportError});
  // SAFETY: hostElement or the grouping branch created every accepted element.
  const host = options.element as ReactElement<HostProps>;
  const changes: HostChanges = {style: {...options.decorators.style, ...current.style}};
  if (clicks !== undefined) changes.onClick = clicks;
  if (keys !== undefined) changes.onKeyDown = keys;
  return cloneElement(host, changes);
}

function hostElement(options: {
  readonly children: readonly ReactElement[];
  readonly inheritedValue: TokenValue;
  readonly token: LiveToken;
}): ReactElement | undefined {
  const value = options.token.hasValue() ? options.token.value() : options.inheritedValue;
  if (options.token.definition === Row) {
    return createElement(
      "div",
      {key: options.token.id, style: {display: "flex", flexDirection: "row"}},
      options.children,
    );
  }
  if (options.token.definition === Column) {
    return createElement(
      "div",
      {key: options.token.id, style: {display: "flex", flexDirection: "column"}},
      options.children,
    );
  }
  if (options.token.definition === Text) {
    return createElement("span", {key: options.token.id}, value === undefined ? "" : String(value));
  }
  if (options.token.definition === Image) {
    if (value === undefined) {
      throw new ProjectionError({
        cause: new Error("Image requires an { src, alt } value"),
        tokenId: options.token.id,
      });
    }
    // SAFETY: Image identity, or a semantic parent using Image(), supplies ImageSource.
    const source = value as ImageSource;
    return createElement("img", {alt: source.alt, key: options.token.id, src: source.src});
  }
  if (options.token.definition === ButtonElement) {
    return createElement("button", {key: options.token.id, type: "button"}, options.children);
  }
  return undefined;
}

function projectToken(options: {
  readonly inheritedValue: TokenValue;
  readonly path: ReadonlySet<number>;
  readonly reportError: ErrorReporter;
  readonly token: LiveToken;
}): readonly ReactElement[] {
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
    projectToken({inheritedValue, path, reportError: options.reportError, token}),
  );
  const host = hostElement({
    children,
    inheritedValue: options.inheritedValue,
    token: options.token,
  });
  if (host !== undefined) {
    return [applyDecorators({decorators, element: host, reportError: options.reportError})];
  }
  if (children.length === 0) return [];
  if (children.length === 1) {
    const child = children[0];
    return child === undefined
      ? []
      : [applyDecorators({decorators, element: child, reportError: options.reportError})];
  }
  return [
    applyDecorators({
      decorators,
      element: createElement("div", {key: options.token.id}, children),
      reportError: options.reportError,
    }),
  ];
}

export function project(options: {
  readonly reportError: ErrorReporter;
  readonly roots: readonly LiveToken[];
}): readonly ReactElement[] {
  return options.roots.flatMap(token =>
    projectToken({
      inheritedValue: undefined,
      path: new Set(),
      reportError: options.reportError,
      token,
    }),
  );
}

export type {SpacingValue, VisibilityValue};
