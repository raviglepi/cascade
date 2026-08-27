import {Component} from "react";
import type {ErrorInfo, ReactNode} from "react";
import type {RuleFailure} from "cascade";

export type CascadeReactReport =
  | {readonly cause: unknown; readonly kind: "listener"; readonly tokenId: number}
  | {readonly cause: unknown; readonly kind: "projection"; readonly tokenId?: number}
  | {readonly cause: unknown; readonly componentStack: string; readonly kind: "render"}
  | {readonly failure: RuleFailure; readonly kind: "rule"};

export type ErrorReporter = (report: CascadeReactReport) => void;

interface ErrorBoundaryProps {
  readonly children?: ReactNode;
  readonly fallback: ReactNode;
  readonly reportError: ErrorReporter;
  readonly resetKey: string;
}

interface ErrorBoundaryState {
  readonly cause: Error | undefined;
  readonly resetKey: string;
}

export class ProjectionError {
  readonly cause: unknown;
  readonly message = "Cascade could not project this token graph";
  readonly tokenId?: number;

  constructor(options: {readonly cause: unknown; readonly tokenId?: number}) {
    this.cause = options.cause;
    if (options.tokenId !== undefined) this.tokenId = options.tokenId;
  }
}

export class CascadeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {cause: undefined, resetKey: this.props.resetKey};

  static getDerivedStateFromError(cause: Error): Partial<ErrorBoundaryState> {
    return {cause};
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : {cause: undefined, resetKey: props.resetKey};
  }

  override componentDidCatch(cause: Error, info: ErrorInfo): void {
    if (cause instanceof ProjectionError) {
      if (cause.tokenId === undefined) {
        this.props.reportError({cause: cause.cause, kind: "projection"});
      } else {
        this.props.reportError({cause: cause.cause, kind: "projection", tokenId: cause.tokenId});
      }
      return;
    }
    this.props.reportError({cause, componentStack: info.componentStack ?? "", kind: "render"});
  }

  override render(): ReactNode {
    return this.state.cause === undefined ? this.props.children : this.props.fallback;
  }
}
