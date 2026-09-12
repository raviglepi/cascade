import type {ReactElement, ReactNode} from "react";
import type {TokenRoot, WhuiyRuntime} from "whuiy";
import type {ErrorReporter} from "./errors.tsx";

import {RegistryProvider, useAtomSuspense} from "@effect/atom-react";
import {Effect, Fiber, Layer, Scope, Stream} from "effect";
import {Atom} from "effect/unstable/reactivity";

import {createElement, memo, useMemo} from "react";
import {isTokenInstance} from "whuiy";
import {WhuiyErrorBoundary} from "./errors.tsx";
import {ListenerDispatcher, project} from "./projection.tsx";

/** @since 0.1.0 */
export interface ReactRendererOptions {
  readonly fallback?: ReactNode;
  readonly reportError: ErrorReporter;
  readonly runtime: WhuiyRuntime;
}

/** @since 0.1.0 */
export interface ReactRenderer {
  render(...roots: readonly TokenRoot[]): ReactElement;
}

interface ProjectionProps {
  readonly reportError: ErrorReporter;
  readonly roots: readonly TokenRoot[];
  readonly runtime: WhuiyRuntime;
}

/** @internal */
export function makeListenerDispatcher(
  reportError: ErrorReporter,
  scope: Scope.Scope,
): ListenerDispatcher["Service"] {
  let service: ListenerDispatcher["Service"];
  service = ListenerDispatcher.of({
    dispatch: effect => {
      const fiber = Effect.runFork(Effect.provideService(effect, ListenerDispatcher, service));
      Effect.runFork(Scope.addFinalizer(scope, Fiber.interrupt(fiber)));
    },
    report: ({cause, tokenId}) =>
      Effect.sync(() => reportError({cause, kind: "listener", tokenId})),
  });
  return service;
}

function makeListenerDispatcherLayer(reportError: ErrorReporter) {
  return Layer.effect(
    ListenerDispatcher,
    Effect.map(Scope.Scope, scope => makeListenerDispatcher(reportError, scope)),
  );
}

/** @internal */
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
          {startImmediately: true},
        );
        const mounted = yield* Effect.acquireRelease(
          runtime.mount(...roots),
          mounted => mounted.release,
        );
        return mounted.changes.pipe(Stream.mapEffect(() => project({roots: mounted.roots})));
      }),
    ),
  );
}

/** @internal */
function makeProjectionAtom(props: ProjectionProps) {
  return Atom.make(
    makeProjectionStream(props).pipe(
      Stream.provide(makeListenerDispatcherLayer(props.reportError), {local: true}),
    ),
  );
}

/** @internal */
function projectServer({reportError, roots, runtime}: ProjectionProps): readonly ReactElement[] {
  return Effect.runSync(
    Effect.scoped(
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
          {startImmediately: true},
        );
        const mounted = yield* Effect.acquireRelease(
          runtime.mount(...roots),
          mounted => mounted.release,
        );
        const scope = yield* Scope.Scope;
        return yield* project({roots: mounted.roots}).pipe(
          Effect.provideService(ListenerDispatcher, makeListenerDispatcher(reportError, scope)),
        );
      }),
    ),
  );
}

const ClientProjection = memo(function ClientProjection(
  props: ProjectionProps,
): readonly ReactElement[] {
  const {reportError, roots, runtime} = props;
  const atom = useMemo(
    () => makeProjectionAtom({reportError, roots, runtime}),
    [reportError, roots, runtime],
  );
  return useAtomSuspense(atom, {suspendOnWaiting: true}).value;
}, sameProjection);

function rootId(root: TokenRoot): number {
  return isTokenInstance(root) ? root.id : root.instance.id;
}

function sameProjection(left: ProjectionProps, right: ProjectionProps): boolean {
  if (left.reportError !== right.reportError || left.runtime !== right.runtime) return false;
  return sameRoots(left.roots, right.roots);
}

function sameRoots(left: readonly TokenRoot[], right: readonly TokenRoot[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((root, index) => rootId(root) === rootId(right[index]!));
}

function Projection(props: ProjectionProps): ReactElement | readonly ReactElement[] {
  return typeof document === "undefined"
    ? projectServer(props)
    : createElement(ClientProjection, {...props, key: props.roots.map(rootId).join(":")});
}

/** @since 0.1.0 */
export function createReactRenderer(options: ReactRendererOptions): ReactRenderer {
  const fallback =
    options.fallback ?? createElement("div", {role: "alert"}, "Unable to render this content.");
  return {
    render: (...roots) =>
      createElement(
        WhuiyErrorBoundary,
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
