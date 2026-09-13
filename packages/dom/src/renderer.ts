import type {LiveToken, TokenDefinitionRef, TokenRoot, TokenValue, WhuiyRuntime} from "whuiy";
import type {ErrorReporter} from "./errors.ts";

import {Cause, Effect, Exit, Fiber, Predicate, Schema, Stream} from "effect";

import {getDecoratorMetadata, getElementMetadata} from "whuiy/primitives";
import {ProjectionError} from "./errors.ts";

type EventHandler = (event: Event) => Effect.Effect<void>;
type Handler = {readonly tokenId: number; readonly value: EventHandler};
interface Decorators {
  readonly events: Map<string, readonly Handler[]>;
  readonly style: Map<string, string | number>;
}
interface ProjectionOptions {
  readonly document: Document;
  readonly fibers: Set<Fiber.Fiber<void, never>>;
  readonly path: ReadonlySet<number>;
  readonly reportError: ErrorReporter;
}

/** @since 0.4.0 */
export interface DomRendererOptions {
  readonly reportError: ErrorReporter;
  readonly runtime: WhuiyRuntime;
}
/** @since 0.4.0 */
export interface DomRender {
  dispose(): void;
}
/** @since 0.4.0 */
export interface DomRenderer {
  render(parent: HTMLElement, ...roots: readonly TokenRoot[]): DomRender;
}

const emptyDecorators: Decorators = {events: new Map(), style: new Map()};
const StyleValueSchema = Schema.Union([Schema.String, Schema.Finite]);

function reads(token: LiveToken, definition: TokenDefinitionRef): TokenValue {
  if (token.definition !== definition)
    throw new ProjectionError({
      cause: new Error("Expected " + definition.name + ", received " + token.definition.name),
      tokenId: token.id,
    });
  return token.value();
}

function requiredHandler(options: {
  readonly token: LiveToken;
  readonly value: TokenValue;
}): Handler {
  if (!isEventHandler(options.value))
    throw new ProjectionError({
      cause: new Error(options.token.definition.name + " requires an Effect listener"),
      tokenId: options.token.id,
    });
  return {tokenId: options.token.id, value: options.value};
}

function isEventHandler(value: TokenValue): value is EventHandler {
  return Predicate.isFunction(value);
}

function styleValue(token: LiveToken, value: TokenValue): string | number {
  if (Schema.is(StyleValueSchema)(value)) return value;
  throw new ProjectionError({
    cause: new Error(token.definition.name + " requires a CSS-compatible style value"),
    tokenId: token.id,
  });
}

function collectStyle(options: {
  readonly decorators: Decorators;
  readonly metadata: {readonly property: string};
  readonly token: LiveToken;
  readonly value: TokenValue;
}): void {
  options.decorators.style.set(options.metadata.property, styleValue(options.token, options.value));
}

function collectListener(options: {
  readonly decorators: Decorators;
  readonly metadata: {readonly property: string};
  readonly token: LiveToken;
  readonly value: TokenValue;
}): void {
  const listeners = options.decorators.events.get(options.metadata.property) ?? [];
  options.decorators.events.set(options.metadata.property, [
    ...listeners,
    requiredHandler({token: options.token, value: options.value}),
  ]);
}

function collectKnownDecorator(options: {
  readonly decorators: Decorators;
  readonly metadata: {readonly kind: "event" | "style"; readonly property: string};
  readonly token: LiveToken;
  readonly value: TokenValue;
}): void {
  if (options.metadata.kind === "style") return collectStyle(options);
  collectListener(options);
}

function collectDecorator(options: {
  readonly decorators: Decorators;
  readonly token: LiveToken;
}): void {
  const metadata = getDecoratorMetadata(options.token.definition);
  if (metadata === undefined) return;
  const value = reads(options.token, metadata.definition);
  if (value === undefined) return;
  collectKnownDecorator({decorators: options.decorators, metadata, token: options.token, value});
}

function collectDecorators(tokens: readonly LiveToken[], inherited: Decorators): Decorators {
  const decorators: Decorators = {
    events: new Map(inherited.events),
    style: new Map(inherited.style),
  };
  for (const token of tokens) collectDecorator({decorators, token});
  return decorators;
}

function nativeEventName(property: string): string {
  return property.slice(2).toLowerCase();
}

function applyDecorators(options: {
  readonly decorators: Decorators;
  readonly element: HTMLElement;
  readonly reportError: ErrorReporter;
  readonly fibers: Set<Fiber.Fiber<void, never>>;
}): void {
  for (const [property, value] of options.decorators.style)
    options.element.style.setProperty(
      property.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase()),
      String(value),
    );
  for (const [property, handlers] of options.decorators.events)
    options.element.addEventListener(nativeEventName(property), event => {
      for (const handler of handlers) {
        const fiber = Effect.runFork(
          Effect.suspend(() => handler.value(event)).pipe(
            Effect.catchCause(cause =>
              Effect.sync(() =>
                options.reportError({cause, kind: "listener", tokenId: handler.tokenId}),
              ),
            ),
          ),
        );
        options.fibers.add(fiber);
      }
    });
}

function nextPath(path: ReadonlySet<number>, token: LiveToken): ReadonlySet<number> {
  if (path.has(token.id))
    throw new ProjectionError({
      cause: new Error(
        "A cycle was found while projecting " + token.definition.name + "#" + token.id,
      ),
      tokenId: token.id,
    });
  return new Set(path).add(token.id);
}

function projectChildren(
  options: ProjectionOptions & {readonly relations: readonly LiveToken[]},
): readonly HTMLElement[] {
  return options.relations
    .filter(token => getDecoratorMetadata(token.definition) === undefined)
    .flatMap(token => projectToken({...options, token}));
}

function decorateChildren(
  options: ProjectionOptions & {
    readonly children: readonly HTMLElement[];
    readonly decorators: Decorators;
    readonly token: LiveToken;
  },
): readonly HTMLElement[] {
  const host = getElementMetadata(options.token.definition);
  if (host !== undefined) return decorateHost({...options, host});
  return decorateContent(options);
}

function decorateHost(
  options: ProjectionOptions & {
    readonly children: readonly HTMLElement[];
    readonly decorators: Decorators;
    readonly host: {readonly tag: string};
  },
): readonly HTMLElement[] {
  const element = options.document.createElement(options.host.tag);
  if (options.host.tag === "button") element.setAttribute("type", "button");
  for (const child of options.children) element.append(child);
  applyDecorators({...options, element});
  return [element];
}

function decorateContent(
  options: ProjectionOptions & {
    readonly children: readonly HTMLElement[];
    readonly decorators: Decorators;
    readonly token: LiveToken;
  },
): readonly HTMLElement[] {
  if (options.children.length === 0) return [];
  const element = contentElement(options);
  applyDecorators({...options, element});
  return [element];
}

function contentElement(
  options: ProjectionOptions & {readonly children: readonly HTMLElement[]},
): HTMLElement {
  if (options.children.length === 1) return onlyChild(options.children);
  const element = options.document.createElement("div");
  for (const child of options.children) element.append(child);
  return element;
}

function onlyChild(children: readonly HTMLElement[]): HTMLElement {
  const child = children[0];
  if (child === undefined)
    throw new ProjectionError({cause: new Error("Expected a projected child")});
  return child;
}

function projectToken(
  options: ProjectionOptions & {readonly token: LiveToken},
): readonly HTMLElement[] {
  const path = nextPath(options.path, options.token);
  const relations = options.token.tokens();
  const decorators = collectDecorators(relations, emptyDecorators);
  const children = projectChildren({...options, path, relations});
  return decorateChildren({...options, children, decorators});
}

function reportProjectionError(options: {
  readonly error: ProjectionError;
  readonly reportError: ErrorReporter;
}): void {
  const report =
    options.error.tokenId === undefined
      ? {cause: options.error.cause, kind: "projection" as const}
      : {cause: options.error.cause, kind: "projection" as const, tokenId: options.error.tokenId};
  options.reportError(report);
}

function projectionFailure(cause: unknown): ProjectionError {
  return cause instanceof ProjectionError ? cause : new ProjectionError({cause});
}

function projectionError(cause: Cause.Cause<ProjectionError>): ProjectionError {
  const error = Cause.findErrorOption(cause);
  return error._tag === "Some" ? error.value : new ProjectionError({cause: Cause.squash(cause)});
}

function replaceOwnedNodes(options: {
  readonly next: readonly HTMLElement[];
  readonly owned: readonly HTMLElement[];
  readonly parent: HTMLElement;
}): readonly HTMLElement[] {
  for (const node of options.owned) node.remove();
  for (const node of options.next) options.parent.append(node);
  return options.next;
}

function projectMounted(options: {
  readonly mounted: {readonly roots: readonly LiveToken[]};
  readonly parent: HTMLElement;
  readonly projection: ProjectionOptions;
}): readonly HTMLElement[] {
  return options.mounted.roots.flatMap(token =>
    projectToken({...options.projection, path: new Set(), token}),
  );
}

function reportProjection(options: {
  readonly mounted: {readonly roots: readonly LiveToken[]};
  readonly parent: HTMLElement;
  readonly projection: ProjectionOptions;
  readonly owned: readonly HTMLElement[];
}): readonly HTMLElement[] {
  const result = Effect.runSyncExit(
    Effect.try({try: () => projectMounted(options), catch: projectionFailure}),
  );
  return Exit.isSuccess(result)
    ? replaceOwnedNodes({next: result.value, owned: options.owned, parent: options.parent})
    : (reportProjectionError({
        error: projectionError(result.cause),
        reportError: options.projection.reportError,
      }),
      options.owned);
}

function interruptFibers(fibers: ReadonlySet<Fiber.Fiber<void, never>>): void {
  for (const fiber of fibers) Effect.runSync(Fiber.interrupt(fiber));
}

/** @since 0.4.0 */
export function createDomRenderer(options: DomRendererOptions): DomRenderer {
  return {
    render(parent, ...roots) {
      const mounted = Effect.runSync(options.runtime.mount(...roots));
      const fibers = new Set<Fiber.Fiber<void, never>>();
      let disposed = false;
      let owned: readonly HTMLElement[] = [];
      const projection: ProjectionOptions = {
        document: parent.ownerDocument,
        fibers,
        path: new Set(),
        reportError: options.reportError,
      };
      const renderProjection = (): void => {
        if (disposed) return;
        owned = reportProjection({mounted, owned, parent, projection});
      };
      renderProjection();
      const changes = Effect.runFork(
        Stream.runForEach(mounted.changes, () => Effect.sync(renderProjection)),
      );
      const failures = Effect.runFork(
        Stream.runForEach(options.runtime.ruleFailures, failure =>
          Effect.sync(() => options.reportError({failure, kind: "rule"})),
        ),
      );
      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const node of owned) node.remove();
          owned = [];
          Effect.runSync(Fiber.interrupt(changes));
          Effect.runSync(Fiber.interrupt(failures));
          interruptFibers(fibers);
          Effect.runSync(mounted.release);
        },
      };
    },
  };
}
