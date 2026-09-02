import type {ReactElement, ReactNode} from "react";
import type {CascadeRuntime, MountedRoots, TokenRoot} from "cascade";
import type {ErrorReporter} from "./errors.tsx";

import {createElement, useEffect, useMemo, useSyncExternalStore} from "react";
import {CascadeErrorBoundary} from "./errors.tsx";
import {project} from "./projection.tsx";

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

function Projection(props: ProjectionProps): readonly ReactElement[] {
  const {reportError, roots, runtime} = props;
  const state = useMemo(() => {
    const stopFailures = runtime.onRuleFailure(failure => reportError({failure, kind: "rule"}));
    const mounted = runtime.mount(...roots);
    return {mounted, stopFailures};
  }, [reportError, roots, runtime]);
  useEffect(
    () => () => {
      state.mounted.release();
      state.stopFailures();
    },
    [state],
  );
  useSyncExternalStore(
    listener => state.mounted.subscribe(listener),
    () => state.mounted.snapshot(),
    () => state.mounted.snapshot(),
  );
  return project({reportError, roots: state.mounted.roots});
}

function rootId(root: TokenRoot): number {
  return "instance" in root ? root.instance.id : root.id;
}

export function createReactRenderer(options: ReactRendererOptions): ReactRenderer {
  const fallback =
    options.fallback ?? createElement("div", {role: "alert"}, "Unable to render this content.");
  return {
    render: (...roots) =>
      createElement(
        CascadeErrorBoundary,
        {fallback, reportError: options.reportError, resetKey: roots.map(rootId).join(":")},
        createElement(Projection, {
          reportError: options.reportError,
          roots,
          runtime: options.runtime,
        }),
      ),
  };
}

export type {MountedRoots};
