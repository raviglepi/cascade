import type {ReactElement, ReactNode} from "react";
import type {CascadeRuntime, TokenRoot} from "cascade";
import type {ErrorReporter} from "./errors.tsx";

import {RegistryProvider, useAtomSuspense} from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Atom from "effect/unstable/reactivity/Atom";
import {createElement, useMemo} from "react";
import {isTokenInstance} from "cascade";
import {CascadeErrorBoundary} from "./errors.tsx";
import {ListenerDispatcher, project} from "./projection.tsx";

export interface ReactRendererOptions {
  readonly fallback?: ReactNode;
  readonly reportError: ErrorReporter;
  readonly runtime: CascadeRuntime;
}

export interface ReactRenderer {
  render(...roots: readonly TokenRoot[]): ReactElement;
}

interface ProjectionProps {
  readonly reportError: ErrorReporter;
  readonly roots: readonly TokenRoot[];
  readonly runtime: CascadeRuntime;
}

/**
 * Sends asynchronous DOM-listener work into Effect from React's callback boundary.
 *
 * @internal
 */
function makeListenerDispatcher(reportError: ErrorReporter): ListenerDispatcher["Service"] {
  let service: ListenerDispatcher["Service"];
  service = ListenerDispatcher.of({
    dispatch: effect => {
      Effect.runFork(Effect.provideService(effect, ListenerDispatcher, service));
    },
    report: ({cause, tokenId}) =>
      Effect.sync(() => reportError({cause, kind: "listener", tokenId})),
  });
  return service;
}

function makeListenerDispatcherLayer(reportError: ErrorReporter) {
  return Layer.succeed(ListenerDispatcher, makeListenerDispatcher(reportError));
}

/**
 * Creates a projection stream with a scope owned by the Atom registry.
 *
 * The failure subscription is acquired before the graph is mounted, so a rule
 * that fails while establishing initial state is still reported.
 *
 * @internal
 */
function makeProjectionStream({reportError, roots, runtime}: ProjectionProps) {
  return Stream.scoped(
    Stream.unwrap(
      Effect.gen(function* () {
        const pullFailures = yield* Stream.toPull(runtime.ruleFailures);
        yield* Effect.forkScoped(
          Effect.forever(
            Effect.flatMap(pullFailures, failures =>
              Effect.forEach(
                failures,
                failure => Effect.sync(() => reportError({failure, kind: "rule"})),
                {discard: true},
              ),
            ),
          ),
        );
        const mounted = yield* Effect.acquireRelease(
          runtime.mount(...roots),
          mounted => mounted.release,
        );
        return Stream.concat(
          Stream.fromEffect(SubscriptionRef.get(mounted.revision)),
          SubscriptionRef.changes(mounted.revision),
        ).pipe(Stream.mapEffect(() => project({roots: mounted.roots})));
      }),
    ),
  );
}

/**
 * Creates an Atom whose registry owns the live Cascade mount and all of its
 * subscriptions.
 *
 * @internal
 */
function makeProjectionAtom(props: ProjectionProps) {
  return Atom.make(
    makeProjectionStream(props).pipe(
      Stream.provide(makeListenerDispatcherLayer(props.reportError), {local: true}),
    ),
  );
}

/**
 * Runs the scoped projection once for React's synchronous server renderer.
 *
 * Server rendering has no React effect lifecycle or Atom registry lifetime,
 * so this is the deliberate integration edge where the finished Effect is
 * executed synchronously and released before markup is returned.
 *
 * @internal
 */
function projectServer({reportError, roots, runtime}: ProjectionProps): readonly ReactElement[] {
  return Effect.runSync(
    Effect.gen(function* () {
      const failureFiber = yield* runtime.ruleFailures.pipe(
        Stream.runForEach(failure => Effect.sync(() => reportError({failure, kind: "rule"}))),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      const mounted = yield* runtime.mount(...roots);
      return yield* project({roots: mounted.roots}).pipe(
        Effect.ensuring(mounted.release),
        Effect.ensuring(Fiber.interrupt(failureFiber)),
      );
    }).pipe(Effect.provideService(ListenerDispatcher, makeListenerDispatcher(reportError))),
  );
}

function ClientProjection(props: ProjectionProps): readonly ReactElement[] {
  const {reportError, roots, runtime} = props;
  const atom = useMemo(
    () => makeProjectionAtom({reportError, roots, runtime}),
    [reportError, roots, runtime],
  );
  return useAtomSuspense(atom, {suspendOnWaiting: true}).value;
}

function Projection(props: ProjectionProps): readonly ReactElement[] {
  return typeof document === "undefined" ? projectServer(props) : ClientProjection(props);
}

function rootId(root: TokenRoot): number {
  return isTokenInstance(root) ? root.id : root.instance.id;
}

export function createReactRenderer(options: ReactRendererOptions): ReactRenderer {
  const fallback =
    options.fallback ?? createElement("div", {role: "alert"}, "Unable to render this content.");
  return {
    render: (...roots) =>
      createElement(
        CascadeErrorBoundary,
        {fallback, reportError: options.reportError, resetKey: roots.map(rootId).join(":")},
        createElement(
          RegistryProvider,
          {},
          createElement(Projection, {
            reportError: options.reportError,
            roots,
            runtime: options.runtime,
          }),
        ),
      ),
  };
}
