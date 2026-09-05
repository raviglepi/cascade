import type {ReactElement, ReactNode} from "react";
import type {CascadeRuntime, TokenRoot} from "cascade";
import type {ErrorReporter} from "./errors.tsx";

import {Effect, Layer, Stream} from "effect";

import {RegistryProvider, useAtomSuspense} from "@effect/atom-react";
import {Atom} from "effect/unstable/reactivity";
import {createElement, useMemo} from "react";
import {isTokenInstance} from "cascade";
import {CascadeErrorBoundary} from "./errors.tsx";
import {ListenerDispatcher, project} from "./projection.tsx";

/** [since](since) 0.1.0 */
export interface ReactRendererOptions {
  readonly fallback?: ReactNode;
  readonly reportError: ErrorReporter;
  readonly runtime: CascadeRuntime;
}

/** [since](since) 0.1.0 */
export interface ReactRenderer {
  render(...roots: readonly TokenRoot[]): ReactElement;
}

interface ProjectionProps {
  readonly reportError: ErrorReporter;
  readonly roots: readonly TokenRoot[];
  readonly runtime: CascadeRuntime;
}

/** [internal](internal) */
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

/** [internal](internal) */
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

/** [internal](internal) */
function makeProjectionAtom(props: ProjectionProps) {
  return Atom.make(
    makeProjectionStream(props).pipe(
      Stream.provide(makeListenerDispatcherLayer(props.reportError), {local: true}),
    ),
  );
}

/** [internal](internal) */
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
        return yield* project({roots: mounted.roots});
      }).pipe(Effect.provideService(ListenerDispatcher, makeListenerDispatcher(reportError))),
    ),
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

/** [since](since) 0.1.0 */
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
